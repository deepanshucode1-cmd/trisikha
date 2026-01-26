import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Incident Detection System", () => {
  describe("Severity Mapping", () => {
    const criticalEvents = [
      "webhook_signature_invalid",
      "payment_signature_invalid",
      "schema_change_detected",
      "service_disruption",
    ];

    const highEvents = [
      "otp_brute_force",
      "admin_auth_failure",
      "bulk_data_export",
      "data_deletion_alert",
      "unauthorized_data_access",
    ];

    const mediumEvents = [
      "rate_limit_exceeded",
      "unauthorized_access",
      "data_modification_anomaly",
      "backup_failure",
    ];

    function getSeverityForEvent(eventType: string): string {
      if (criticalEvents.includes(eventType)) return "critical";
      if (highEvents.includes(eventType)) return "high";
      if (mediumEvents.includes(eventType)) return "medium";
      return "low";
    }

    it("should return critical for webhook_signature_invalid", () => {
      expect(getSeverityForEvent("webhook_signature_invalid")).toBe("critical");
    });

    it("should return critical for payment_signature_invalid", () => {
      expect(getSeverityForEvent("payment_signature_invalid")).toBe("critical");
    });

    it("should return critical for service_disruption", () => {
      expect(getSeverityForEvent("service_disruption")).toBe("critical");
    });

    it("should return high for otp_brute_force", () => {
      expect(getSeverityForEvent("otp_brute_force")).toBe("high");
    });

    it("should return high for admin_auth_failure", () => {
      expect(getSeverityForEvent("admin_auth_failure")).toBe("high");
    });

    it("should return high for bulk_data_export", () => {
      expect(getSeverityForEvent("bulk_data_export")).toBe("high");
    });

    it("should return medium for rate_limit_exceeded", () => {
      expect(getSeverityForEvent("rate_limit_exceeded")).toBe("medium");
    });

    it("should return medium for unauthorized_access", () => {
      expect(getSeverityForEvent("unauthorized_access")).toBe("medium");
    });

    it("should return low for unknown events", () => {
      expect(getSeverityForEvent("unknown_event")).toBe("low");
    });
  });

  describe("Event to Incident Type Mapping", () => {
    type IncidentType =
      | "rate_limit_exceeded"
      | "payment_signature_invalid"
      | "webhook_signature_invalid"
      | "otp_brute_force"
      | "unauthorized_access"
      | "suspicious_pattern";

    const mapping: Record<string, IncidentType> = {
      rate_limit_exceeded: "rate_limit_exceeded",
      payment_signature_invalid: "payment_signature_invalid",
      webhook_signature_invalid: "webhook_signature_invalid",
      invalid_webhook_signature: "webhook_signature_invalid",
      invalid_shiprocket_webhook_token: "webhook_signature_invalid",
      otp_account_locked: "otp_brute_force",
      otp_verification_failed: "otp_brute_force",
      unauthorized_access: "unauthorized_access",
      unauthorized_order_access: "unauthorized_access",
    };

    function mapEventToIncidentType(event: string): IncidentType {
      return mapping[event] || "suspicious_pattern";
    }

    it("should map rate_limit_exceeded correctly", () => {
      expect(mapEventToIncidentType("rate_limit_exceeded")).toBe("rate_limit_exceeded");
    });

    it("should map payment_signature_invalid correctly", () => {
      expect(mapEventToIncidentType("payment_signature_invalid")).toBe("payment_signature_invalid");
    });

    it("should map invalid_webhook_signature to webhook_signature_invalid", () => {
      expect(mapEventToIncidentType("invalid_webhook_signature")).toBe("webhook_signature_invalid");
    });

    it("should map invalid_shiprocket_webhook_token to webhook_signature_invalid", () => {
      expect(mapEventToIncidentType("invalid_shiprocket_webhook_token")).toBe("webhook_signature_invalid");
    });

    it("should map otp_account_locked to otp_brute_force", () => {
      expect(mapEventToIncidentType("otp_account_locked")).toBe("otp_brute_force");
    });

    it("should map otp_verification_failed to otp_brute_force", () => {
      expect(mapEventToIncidentType("otp_verification_failed")).toBe("otp_brute_force");
    });

    it("should map unauthorized_order_access to unauthorized_access", () => {
      expect(mapEventToIncidentType("unauthorized_order_access")).toBe("unauthorized_access");
    });

    it("should map unknown events to suspicious_pattern", () => {
      expect(mapEventToIncidentType("unknown_event")).toBe("suspicious_pattern");
    });
  });

  describe("Incident Configuration", () => {
    interface IncidentConfig {
      rateLimitThreshold: number;
      rateLimitWindowMins: number;
      signatureThreshold: number;
      bruteForceThreshold: number;
    }

    function getIncidentConfig(): IncidentConfig {
      return {
        rateLimitThreshold: parseInt(process.env.INCIDENT_RATE_LIMIT_THRESHOLD || "5"),
        rateLimitWindowMins: parseInt(process.env.INCIDENT_RATE_LIMIT_WINDOW_MINS || "10"),
        signatureThreshold: parseInt(process.env.INCIDENT_SIGNATURE_THRESHOLD || "3"),
        bruteForceThreshold: parseInt(process.env.INCIDENT_BRUTE_FORCE_THRESHOLD || "10"),
      };
    }

    it("should return default rate limit threshold of 5", () => {
      const config = getIncidentConfig();
      expect(config.rateLimitThreshold).toBe(5);
    });

    it("should return default window of 10 minutes", () => {
      const config = getIncidentConfig();
      expect(config.rateLimitWindowMins).toBe(10);
    });

    it("should return default signature threshold of 3", () => {
      const config = getIncidentConfig();
      expect(config.signatureThreshold).toBe(3);
    });

    it("should return default brute force threshold of 10", () => {
      const config = getIncidentConfig();
      expect(config.bruteForceThreshold).toBe(10);
    });
  });

  describe("Counter Key Generation", () => {
    interface CounterKeyParams {
      eventType: string;
      ip?: string;
      orderId?: string;
    }

    function generateCounterKey(params: CounterKeyParams): string | null {
      const { eventType, ip, orderId } = params;

      switch (eventType) {
        case "rate_limit_exceeded":
          return `incident:ratelimit:${ip}`;

        case "payment_signature_invalid":
        case "webhook_signature_invalid":
        case "invalid_webhook_signature":
        case "invalid_shiprocket_webhook_token":
          return `incident:signature:${ip}`;

        case "otp_account_locked":
        case "otp_verification_failed":
          return `incident:bruteforce:${orderId || ip}`;

        case "unauthorized_access":
        case "unauthorized_order_access":
          return `incident:unauth:${ip}`;

        default:
          return null;
      }
    }

    it("should generate rate limit counter key", () => {
      const key = generateCounterKey({
        eventType: "rate_limit_exceeded",
        ip: "192.168.1.1",
      });
      expect(key).toBe("incident:ratelimit:192.168.1.1");
    });

    it("should generate signature counter key", () => {
      const key = generateCounterKey({
        eventType: "payment_signature_invalid",
        ip: "10.0.0.1",
      });
      expect(key).toBe("incident:signature:10.0.0.1");
    });

    it("should generate brute force counter key with orderId", () => {
      const key = generateCounterKey({
        eventType: "otp_verification_failed",
        ip: "192.168.1.1",
        orderId: "order-123",
      });
      expect(key).toBe("incident:bruteforce:order-123");
    });

    it("should generate brute force counter key with ip fallback", () => {
      const key = generateCounterKey({
        eventType: "otp_verification_failed",
        ip: "192.168.1.1",
      });
      expect(key).toBe("incident:bruteforce:192.168.1.1");
    });

    it("should generate unauth counter key", () => {
      const key = generateCounterKey({
        eventType: "unauthorized_access",
        ip: "172.16.0.1",
      });
      expect(key).toBe("incident:unauth:172.16.0.1");
    });

    it("should return null for unknown events", () => {
      const key = generateCounterKey({
        eventType: "unknown_event",
        ip: "192.168.1.1",
      });
      expect(key).toBeNull();
    });
  });

  describe("Threshold Detection Logic", () => {
    interface ThresholdResult {
      shouldCreateIncident: boolean;
      threshold: number;
      currentCount: number;
    }

    function checkThreshold(
      eventType: string,
      currentCount: number
    ): ThresholdResult {
      const thresholds: Record<string, number> = {
        rate_limit_exceeded: 5,
        payment_signature_invalid: 3,
        webhook_signature_invalid: 3,
        otp_verification_failed: 10,
        unauthorized_access: 5,
      };

      const threshold = thresholds[eventType] || 5;

      // Create incident only on exact threshold hit
      const shouldCreateIncident = currentCount === threshold;

      return {
        shouldCreateIncident,
        threshold,
        currentCount,
      };
    }

    it("should trigger incident on exact threshold for rate_limit", () => {
      const result = checkThreshold("rate_limit_exceeded", 5);
      expect(result.shouldCreateIncident).toBe(true);
      expect(result.threshold).toBe(5);
    });

    it("should not trigger incident below threshold", () => {
      const result = checkThreshold("rate_limit_exceeded", 4);
      expect(result.shouldCreateIncident).toBe(false);
    });

    it("should not trigger incident above threshold (avoid duplicates)", () => {
      const result = checkThreshold("rate_limit_exceeded", 6);
      expect(result.shouldCreateIncident).toBe(false);
    });

    it("should trigger incident on exact threshold for signature events", () => {
      const result = checkThreshold("payment_signature_invalid", 3);
      expect(result.shouldCreateIncident).toBe(true);
      expect(result.threshold).toBe(3);
    });

    it("should trigger incident on exact threshold for brute force", () => {
      const result = checkThreshold("otp_verification_failed", 10);
      expect(result.shouldCreateIncident).toBe(true);
      expect(result.threshold).toBe(10);
    });
  });

  describe("Incident Status Workflow", () => {
    type IncidentStatus = "open" | "investigating" | "resolved" | "false_positive";

    function isValidStatusTransition(
      from: IncidentStatus,
      to: IncidentStatus
    ): boolean {
      const validTransitions: Record<IncidentStatus, IncidentStatus[]> = {
        open: ["investigating", "resolved", "false_positive"],
        investigating: ["resolved", "false_positive", "open"],
        resolved: ["open"], // Can reopen
        false_positive: ["open"], // Can reopen
      };

      return validTransitions[from]?.includes(to) || false;
    }

    it("should allow transition from open to investigating", () => {
      expect(isValidStatusTransition("open", "investigating")).toBe(true);
    });

    it("should allow transition from open to resolved", () => {
      expect(isValidStatusTransition("open", "resolved")).toBe(true);
    });

    it("should allow transition from open to false_positive", () => {
      expect(isValidStatusTransition("open", "false_positive")).toBe(true);
    });

    it("should allow transition from investigating to resolved", () => {
      expect(isValidStatusTransition("investigating", "resolved")).toBe(true);
    });

    it("should allow reopening resolved incidents", () => {
      expect(isValidStatusTransition("resolved", "open")).toBe(true);
    });

    it("should allow reopening false_positive incidents", () => {
      expect(isValidStatusTransition("false_positive", "open")).toBe(true);
    });
  });

  describe("Account Lockout Duration", () => {
    function calculateLockoutEnd(durationHours: number): Date {
      return new Date(Date.now() + durationHours * 60 * 60 * 1000);
    }

    function isAccountLocked(lockedUntil: Date | null): boolean {
      if (!lockedUntil) return false;
      return lockedUntil > new Date();
    }

    it("should calculate correct lockout end for 24 hours", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const lockoutEnd = calculateLockoutEnd(24);
      const expectedMs = now + 24 * 60 * 60 * 1000;

      expect(lockoutEnd.getTime()).toBe(expectedMs);

      vi.useRealTimers();
    });

    it("should return locked when lockout is active", () => {
      const futureLockout = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      expect(isAccountLocked(futureLockout)).toBe(true);
    });

    it("should return not locked when lockout has expired", () => {
      const pastLockout = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      expect(isAccountLocked(pastLockout)).toBe(false);
    });

    it("should return not locked when no lockout set", () => {
      expect(isAccountLocked(null)).toBe(false);
    });
  });

  describe("Incident Description Generation", () => {
    function generateIncidentDescription(
      incidentType: string,
      count: number,
      windowMins: number
    ): string {
      return `${incidentType} threshold exceeded: ${count} events in ${windowMins} minutes`;
    }

    it("should generate correct description for rate limit", () => {
      const desc = generateIncidentDescription("rate_limit_exceeded", 5, 10);
      expect(desc).toBe("rate_limit_exceeded threshold exceeded: 5 events in 10 minutes");
    });

    it("should generate correct description for signature failure", () => {
      const desc = generateIncidentDescription("payment_signature_invalid", 3, 10);
      expect(desc).toBe("payment_signature_invalid threshold exceeded: 3 events in 10 minutes");
    });
  });

  describe("CIA Triad Incident Types", () => {
    const ciaIncidents = {
      confidentiality: ["bulk_data_export", "unauthorized_data_access"],
      integrity: ["data_modification_anomaly", "schema_change_detected"],
      availability: ["service_disruption", "data_deletion_alert", "backup_failure"],
    };

    function getCiaCategory(incidentType: string): string | null {
      for (const [category, types] of Object.entries(ciaIncidents)) {
        if (types.includes(incidentType)) {
          return category;
        }
      }
      return null;
    }

    it("should categorize bulk_data_export as confidentiality", () => {
      expect(getCiaCategory("bulk_data_export")).toBe("confidentiality");
    });

    it("should categorize unauthorized_data_access as confidentiality", () => {
      expect(getCiaCategory("unauthorized_data_access")).toBe("confidentiality");
    });

    it("should categorize data_modification_anomaly as integrity", () => {
      expect(getCiaCategory("data_modification_anomaly")).toBe("integrity");
    });

    it("should categorize schema_change_detected as integrity", () => {
      expect(getCiaCategory("schema_change_detected")).toBe("integrity");
    });

    it("should categorize service_disruption as availability", () => {
      expect(getCiaCategory("service_disruption")).toBe("availability");
    });

    it("should categorize backup_failure as availability", () => {
      expect(getCiaCategory("backup_failure")).toBe("availability");
    });

    it("should return null for non-CIA incidents", () => {
      expect(getCiaCategory("rate_limit_exceeded")).toBeNull();
    });
  });
});
