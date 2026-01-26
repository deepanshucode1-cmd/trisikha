import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Security Event Integration", () => {
  describe("trackSecurityEvent Flow", () => {
    // Simulate the trackSecurityEvent flow
    interface SecurityEvent {
      event: string;
      details: Record<string, unknown>;
    }

    interface AnomalyParams {
      eventType: string;
      ip?: string;
      userId?: string;
      orderId?: string;
      endpoint?: string;
      details?: Record<string, unknown>;
    }

    // In-memory counter for testing
    const eventCounters = new Map<string, number>();
    const createdIncidents: Array<{
      type: string;
      severity: string;
      ip?: string;
    }> = [];

    function resetTestState() {
      eventCounters.clear();
      createdIncidents.length = 0;
    }

    function mockLogSecurityEvent(event: string, details: Record<string, unknown>) {
      // Just logs, doesn't create incidents
      return { event, details, logged: true };
    }

    async function mockDetectAnomaly(params: AnomalyParams): Promise<boolean> {
      const { eventType, ip } = params;

      // Threshold configuration
      const thresholds: Record<string, number> = {
        rate_limit_exceeded: 5,
        payment_signature_invalid: 3,
        webhook_signature_invalid: 3,
        otp_verification_failed: 10,
      };

      const threshold = thresholds[eventType];
      if (!threshold) return false;

      // Generate counter key
      const counterKey = `${eventType}:${ip}`;
      const currentCount = (eventCounters.get(counterKey) || 0) + 1;
      eventCounters.set(counterKey, currentCount);

      // Check threshold
      if (currentCount === threshold) {
        // Create incident
        createdIncidents.push({
          type: eventType,
          severity: getSeverity(eventType),
          ip,
        });
        return true;
      }

      return false;
    }

    function getSeverity(eventType: string): string {
      if (["payment_signature_invalid", "webhook_signature_invalid"].includes(eventType)) {
        return "critical";
      }
      if (eventType === "otp_verification_failed") {
        return "high";
      }
      return "medium";
    }

    async function mockTrackSecurityEvent(
      event: string,
      details: Record<string, unknown>
    ): Promise<{ logged: boolean; incidentCreated: boolean }> {
      // Always log
      mockLogSecurityEvent(event, details);

      // Attempt anomaly detection
      const incidentCreated = await mockDetectAnomaly({
        eventType: event,
        ip: details.ip as string,
        userId: details.userId as string,
        orderId: details.orderId as string,
        endpoint: details.endpoint as string,
        details,
      });

      return { logged: true, incidentCreated };
    }

    beforeEach(() => {
      resetTestState();
    });

    it("should log event but not create incident below threshold", async () => {
      const result = await mockTrackSecurityEvent("rate_limit_exceeded", {
        ip: "192.168.1.1",
        endpoint: "/api/checkout",
      });

      expect(result.logged).toBe(true);
      expect(result.incidentCreated).toBe(false);
      expect(createdIncidents.length).toBe(0);
    });

    it("should create incident when rate_limit threshold reached", async () => {
      const ip = "192.168.1.1";

      // Trigger 4 events (below threshold)
      for (let i = 0; i < 4; i++) {
        await mockTrackSecurityEvent("rate_limit_exceeded", { ip, endpoint: "/api/checkout" });
      }
      expect(createdIncidents.length).toBe(0);

      // Trigger 5th event (at threshold)
      const result = await mockTrackSecurityEvent("rate_limit_exceeded", { ip, endpoint: "/api/checkout" });

      expect(result.incidentCreated).toBe(true);
      expect(createdIncidents.length).toBe(1);
      expect(createdIncidents[0].type).toBe("rate_limit_exceeded");
      expect(createdIncidents[0].severity).toBe("medium");
    });

    it("should not create duplicate incidents above threshold", async () => {
      const ip = "10.0.0.1";

      // Trigger events to reach and exceed threshold
      for (let i = 0; i < 7; i++) {
        await mockTrackSecurityEvent("rate_limit_exceeded", { ip, endpoint: "/api/track" });
      }

      // Should have created exactly 1 incident (on the 5th event)
      expect(createdIncidents.length).toBe(1);
    });

    it("should create critical incident for payment_signature_invalid at threshold 3", async () => {
      const ip = "172.16.0.1";

      for (let i = 0; i < 2; i++) {
        await mockTrackSecurityEvent("payment_signature_invalid", { ip, orderId: "order-123" });
      }
      expect(createdIncidents.length).toBe(0);

      // 3rd event triggers incident
      await mockTrackSecurityEvent("payment_signature_invalid", { ip, orderId: "order-123" });

      expect(createdIncidents.length).toBe(1);
      expect(createdIncidents[0].type).toBe("payment_signature_invalid");
      expect(createdIncidents[0].severity).toBe("critical");
    });

    it("should create critical incident for webhook_signature_invalid at threshold 3", async () => {
      const ip = "10.10.10.10";

      for (let i = 0; i < 3; i++) {
        await mockTrackSecurityEvent("webhook_signature_invalid", { ip, endpoint: "/api/webhooks/razorpay/verify" });
      }

      expect(createdIncidents.length).toBe(1);
      expect(createdIncidents[0].severity).toBe("critical");
    });

    it("should track events separately per IP", async () => {
      const ip1 = "192.168.1.1";
      const ip2 = "192.168.1.2";

      // 4 events from IP1
      for (let i = 0; i < 4; i++) {
        await mockTrackSecurityEvent("rate_limit_exceeded", { ip: ip1, endpoint: "/api/checkout" });
      }

      // 4 events from IP2
      for (let i = 0; i < 4; i++) {
        await mockTrackSecurityEvent("rate_limit_exceeded", { ip: ip2, endpoint: "/api/checkout" });
      }

      // No incidents yet (both below threshold)
      expect(createdIncidents.length).toBe(0);

      // IP1 reaches threshold
      await mockTrackSecurityEvent("rate_limit_exceeded", { ip: ip1, endpoint: "/api/checkout" });
      expect(createdIncidents.length).toBe(1);
      expect(createdIncidents[0].ip).toBe(ip1);

      // IP2 reaches threshold
      await mockTrackSecurityEvent("rate_limit_exceeded", { ip: ip2, endpoint: "/api/checkout" });
      expect(createdIncidents.length).toBe(2);
      expect(createdIncidents[1].ip).toBe(ip2);
    });

    it("should not create incidents for unmapped event types", async () => {
      // Unknown event type should not trigger incident
      for (let i = 0; i < 10; i++) {
        await mockTrackSecurityEvent("some_unknown_event", { ip: "192.168.1.1" });
      }

      expect(createdIncidents.length).toBe(0);
    });
  });

  describe("IP Blocking Integration", () => {
    interface BlockedIp {
      ip: string;
      type: "temporary" | "permanent";
      incidentType: string;
      incidentId: string;
    }

    const blockedIps: BlockedIp[] = [];

    function resetBlockState() {
      blockedIps.length = 0;
    }

    async function mockBlockIp(params: {
      ip: string;
      incidentType: string;
      severity: string;
      incidentId: string;
    }) {
      const permanentTypes = ["payment_signature_invalid", "webhook_signature_invalid"];
      const blockType = permanentTypes.includes(params.incidentType) || params.severity === "critical"
        ? "permanent"
        : "temporary";

      blockedIps.push({
        ip: params.ip,
        type: blockType,
        incidentType: params.incidentType,
        incidentId: params.incidentId,
      });
    }

    beforeEach(() => {
      resetBlockState();
    });

    it("should block IP with temporary block for rate_limit_exceeded", async () => {
      await mockBlockIp({
        ip: "192.168.1.1",
        incidentType: "rate_limit_exceeded",
        severity: "medium",
        incidentId: "inc-123",
      });

      expect(blockedIps.length).toBe(1);
      expect(blockedIps[0].type).toBe("temporary");
    });

    it("should block IP with permanent block for payment_signature_invalid", async () => {
      await mockBlockIp({
        ip: "10.0.0.1",
        incidentType: "payment_signature_invalid",
        severity: "critical",
        incidentId: "inc-456",
      });

      expect(blockedIps.length).toBe(1);
      expect(blockedIps[0].type).toBe("permanent");
    });

    it("should block IP with permanent block for critical severity", async () => {
      await mockBlockIp({
        ip: "172.16.0.1",
        incidentType: "some_incident",
        severity: "critical",
        incidentId: "inc-789",
      });

      expect(blockedIps.length).toBe(1);
      expect(blockedIps[0].type).toBe("permanent");
    });

    it("should include incident reference in block record", async () => {
      await mockBlockIp({
        ip: "192.168.1.1",
        incidentType: "otp_brute_force",
        severity: "high",
        incidentId: "inc-999",
      });

      expect(blockedIps[0].incidentId).toBe("inc-999");
      expect(blockedIps[0].incidentType).toBe("otp_brute_force");
    });
  });

  describe("Proxy IP Block Check Integration", () => {
    interface BlockCheckResult {
      blocked: boolean;
      reason?: string;
      blockedUntil?: string;
    }

    // Simulated block cache
    const blockCache = new Map<string, { isBlocked: boolean; reason?: string; blockedUntil?: string }>();

    function setBlockedIp(ip: string, reason: string, blockedUntil?: string) {
      blockCache.set(ip, { isBlocked: true, reason, blockedUntil });
    }

    function clearBlockCache() {
      blockCache.clear();
    }

    async function mockIsIpBlockedFast(ip: string): Promise<BlockCheckResult> {
      if (!ip || ip === "unknown") {
        return { blocked: false };
      }

      const cached = blockCache.get(ip);
      if (!cached || !cached.isBlocked) {
        return { blocked: false };
      }

      // Check if temporary block has expired
      if (cached.blockedUntil) {
        if (new Date(cached.blockedUntil) <= new Date()) {
          return { blocked: false };
        }
      }

      return {
        blocked: true,
        reason: cached.reason,
        blockedUntil: cached.blockedUntil,
      };
    }

    beforeEach(() => {
      clearBlockCache();
    });

    it("should allow unblocked IPs", async () => {
      const result = await mockIsIpBlockedFast("192.168.1.1");
      expect(result.blocked).toBe(false);
    });

    it("should block permanently blocked IPs", async () => {
      setBlockedIp("10.0.0.1", "Permanent block: payment_signature_invalid");

      const result = await mockIsIpBlockedFast("10.0.0.1");
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain("payment_signature_invalid");
    });

    it("should block temporarily blocked IPs within block period", async () => {
      const blockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
      setBlockedIp("192.168.1.1", "Temporary block", blockedUntil);

      const result = await mockIsIpBlockedFast("192.168.1.1");
      expect(result.blocked).toBe(true);
      expect(result.blockedUntil).toBe(blockedUntil);
    });

    it("should allow temporarily blocked IPs after block expires", async () => {
      const expiredBlockedUntil = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
      setBlockedIp("192.168.1.1", "Temporary block", expiredBlockedUntil);

      const result = await mockIsIpBlockedFast("192.168.1.1");
      expect(result.blocked).toBe(false);
    });

    it("should handle unknown IP gracefully", async () => {
      const result = await mockIsIpBlockedFast("unknown");
      expect(result.blocked).toBe(false);
    });

    it("should handle empty IP gracefully", async () => {
      const result = await mockIsIpBlockedFast("");
      expect(result.blocked).toBe(false);
    });
  });

  describe("End-to-End Security Flow", () => {
    // Simulates the complete flow: API call -> trackSecurityEvent -> detectAnomaly -> createIncident -> blockIp

    interface E2EState {
      loggedEvents: Array<{ event: string; ip: string }>;
      eventCounts: Map<string, number>;
      incidents: Array<{ id: string; type: string; ip: string }>;
      blockedIps: Map<string, { type: string; incidentId: string }>;
    }

    let state: E2EState;

    function resetE2EState() {
      state = {
        loggedEvents: [],
        eventCounts: new Map(),
        incidents: [],
        blockedIps: new Map(),
      };
    }

    async function simulateApiCall(params: {
      endpoint: string;
      ip: string;
      triggerEvent?: string;
    }): Promise<{ status: number; blocked: boolean }> {
      const { endpoint, ip, triggerEvent } = params;

      // Check if IP is blocked
      if (state.blockedIps.has(ip)) {
        return { status: 403, blocked: true };
      }

      // If event triggered, process through security pipeline
      if (triggerEvent) {
        // Log event
        state.loggedEvents.push({ event: triggerEvent, ip });

        // Increment counter
        const counterKey = `${triggerEvent}:${ip}`;
        const count = (state.eventCounts.get(counterKey) || 0) + 1;
        state.eventCounts.set(counterKey, count);

        // Check threshold
        const thresholds: Record<string, number> = {
          rate_limit_exceeded: 5,
          payment_signature_invalid: 3,
        };

        const threshold = thresholds[triggerEvent];
        if (threshold && count === threshold) {
          // Create incident
          const incidentId = `inc-${Date.now()}`;
          state.incidents.push({ id: incidentId, type: triggerEvent, ip });

          // Block IP
          const blockType = triggerEvent === "payment_signature_invalid" ? "permanent" : "temporary";
          state.blockedIps.set(ip, { type: blockType, incidentId });
        }
      }

      return { status: 200, blocked: false };
    }

    beforeEach(() => {
      resetE2EState();
    });

    it("should allow normal traffic until threshold", async () => {
      const ip = "192.168.1.100";

      for (let i = 0; i < 4; i++) {
        const result = await simulateApiCall({
          endpoint: "/api/checkout",
          ip,
          triggerEvent: "rate_limit_exceeded",
        });
        expect(result.status).toBe(200);
        expect(result.blocked).toBe(false);
      }

      expect(state.incidents.length).toBe(0);
      expect(state.blockedIps.size).toBe(0);
    });

    it("should block IP after threshold and deny subsequent requests", async () => {
      const ip = "192.168.1.100";

      // 4 requests pass
      for (let i = 0; i < 4; i++) {
        await simulateApiCall({
          endpoint: "/api/checkout",
          ip,
          triggerEvent: "rate_limit_exceeded",
        });
      }

      // 5th request triggers block
      const fifthResult = await simulateApiCall({
        endpoint: "/api/checkout",
        ip,
        triggerEvent: "rate_limit_exceeded",
      });
      expect(fifthResult.status).toBe(200); // Still processes but triggers block

      // Verify incident created and IP blocked
      expect(state.incidents.length).toBe(1);
      expect(state.blockedIps.has(ip)).toBe(true);

      // 6th request should be blocked
      const sixthResult = await simulateApiCall({
        endpoint: "/api/checkout",
        ip,
        triggerEvent: "rate_limit_exceeded",
      });
      expect(sixthResult.status).toBe(403);
      expect(sixthResult.blocked).toBe(true);
    });

    it("should create permanent block for payment signature invalid", async () => {
      const ip = "10.0.0.100";

      for (let i = 0; i < 3; i++) {
        await simulateApiCall({
          endpoint: "/api/payment/verify",
          ip,
          triggerEvent: "payment_signature_invalid",
        });
      }

      expect(state.blockedIps.has(ip)).toBe(true);
      expect(state.blockedIps.get(ip)?.type).toBe("permanent");
    });

    it("should log all events until IP is blocked", async () => {
      const ip = "172.16.0.100";

      for (let i = 0; i < 10; i++) {
        await simulateApiCall({
          endpoint: "/api/track",
          ip,
          triggerEvent: "rate_limit_exceeded",
        });
      }

      // 5 events logged before IP was blocked (threshold reached on 5th)
      // After blocking, subsequent requests are denied without logging
      expect(state.loggedEvents.length).toBe(5);
      // Verify the block occurred
      expect(state.blockedIps.has(ip)).toBe(true);
    });
  });
});
