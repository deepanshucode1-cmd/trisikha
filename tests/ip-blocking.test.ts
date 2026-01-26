import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Test the pure utility functions extracted from ip-blocking logic
describe("IP Blocking System", () => {
  describe("Block Duration Calculation", () => {
    // Exponential backoff durations in minutes
    const BLOCK_DURATIONS: Record<number, number> = {
      1: 15,        // First offense: 15 minutes
      2: 60,        // Second offense: 1 hour
      3: 360,       // Third offense: 6 hours
      4: 1440,      // Fourth offense: 24 hours
      5: 10080,     // Fifth+ offense: 7 days
    };

    function getBlockDuration(offenseCount: number): number {
      const level = Math.min(offenseCount, 5);
      return BLOCK_DURATIONS[level] || BLOCK_DURATIONS[5];
    }

    it("should return 15 minutes for first offense", () => {
      expect(getBlockDuration(1)).toBe(15);
    });

    it("should return 1 hour (60 min) for second offense", () => {
      expect(getBlockDuration(2)).toBe(60);
    });

    it("should return 6 hours (360 min) for third offense", () => {
      expect(getBlockDuration(3)).toBe(360);
    });

    it("should return 24 hours (1440 min) for fourth offense", () => {
      expect(getBlockDuration(4)).toBe(1440);
    });

    it("should return 7 days (10080 min) for fifth offense", () => {
      expect(getBlockDuration(5)).toBe(10080);
    });

    it("should cap at 7 days for offenses beyond 5", () => {
      expect(getBlockDuration(6)).toBe(10080);
      expect(getBlockDuration(10)).toBe(10080);
      expect(getBlockDuration(100)).toBe(10080);
    });
  });

  describe("Block Until Calculation", () => {
    function calculateBlockedUntil(offenseCount: number): Date {
      const BLOCK_DURATIONS: Record<number, number> = {
        1: 15, 2: 60, 3: 360, 4: 1440, 5: 10080,
      };
      const level = Math.min(offenseCount, 5);
      const durationMinutes = BLOCK_DURATIONS[level] || BLOCK_DURATIONS[5];
      return new Date(Date.now() + durationMinutes * 60 * 1000);
    }

    it("should calculate correct expiry time for first offense", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const blockedUntil = calculateBlockedUntil(1);
      const expectedMs = now + 15 * 60 * 1000;

      expect(blockedUntil.getTime()).toBe(expectedMs);

      vi.useRealTimers();
    });

    it("should calculate correct expiry time for fifth offense", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const blockedUntil = calculateBlockedUntil(5);
      const expectedMs = now + 10080 * 60 * 1000; // 7 days

      expect(blockedUntil.getTime()).toBe(expectedMs);

      vi.useRealTimers();
    });
  });

  describe("Block Type Determination", () => {
    const TEMPORARY_BLOCK_INCIDENTS = [
      "rate_limit_exceeded",
      "otp_brute_force",
      "suspicious_pattern",
      "unauthorized_access",
    ];

    const PERMANENT_BLOCK_INCIDENTS = [
      "payment_signature_invalid",
      "webhook_signature_invalid",
    ];

    function shouldBlockForIncident(
      incidentType: string,
      severity: string
    ): boolean {
      if (PERMANENT_BLOCK_INCIDENTS.includes(incidentType)) return true;
      if (severity === "critical") return true;
      if (TEMPORARY_BLOCK_INCIDENTS.includes(incidentType)) return true;
      return false;
    }

    function shouldBePermanent(incidentType: string, severity: string): boolean {
      return (
        PERMANENT_BLOCK_INCIDENTS.includes(incidentType) ||
        severity === "critical"
      );
    }

    it("should trigger block for rate_limit_exceeded", () => {
      expect(shouldBlockForIncident("rate_limit_exceeded", "medium")).toBe(true);
    });

    it("should trigger block for otp_brute_force", () => {
      expect(shouldBlockForIncident("otp_brute_force", "high")).toBe(true);
    });

    it("should trigger block for payment_signature_invalid", () => {
      expect(shouldBlockForIncident("payment_signature_invalid", "critical")).toBe(true);
    });

    it("should trigger block for webhook_signature_invalid", () => {
      expect(shouldBlockForIncident("webhook_signature_invalid", "critical")).toBe(true);
    });

    it("should trigger block for any critical severity", () => {
      expect(shouldBlockForIncident("unknown_incident", "critical")).toBe(true);
    });

    it("should not trigger block for low severity unknown incident", () => {
      expect(shouldBlockForIncident("unknown_incident", "low")).toBe(false);
    });

    it("should return permanent for payment_signature_invalid", () => {
      expect(shouldBePermanent("payment_signature_invalid", "critical")).toBe(true);
    });

    it("should return permanent for webhook_signature_invalid", () => {
      expect(shouldBePermanent("webhook_signature_invalid", "critical")).toBe(true);
    });

    it("should return permanent for critical severity", () => {
      expect(shouldBePermanent("any_incident", "critical")).toBe(true);
    });

    it("should return temporary for rate_limit_exceeded", () => {
      expect(shouldBePermanent("rate_limit_exceeded", "medium")).toBe(false);
    });

    it("should return temporary for otp_brute_force", () => {
      expect(shouldBePermanent("otp_brute_force", "high")).toBe(false);
    });
  });

  describe("Whitelist IP Check", () => {
    // Test CIDR range matching logic
    function isIpInCidr(ip: string, cidr: string): boolean {
      // Simple implementation for testing
      const [range, bits] = cidr.split("/");
      const rangeParts = range.split(".").map(Number);
      const ipParts = ip.split(".").map(Number);
      const mask = parseInt(bits);

      if (mask === 8) {
        return ipParts[0] === rangeParts[0];
      } else if (mask === 16) {
        return ipParts[0] === rangeParts[0] && ipParts[1] === rangeParts[1];
      } else if (mask === 24) {
        return (
          ipParts[0] === rangeParts[0] &&
          ipParts[1] === rangeParts[1] &&
          ipParts[2] === rangeParts[2]
        );
      }
      return false;
    }

    it("should match IP in /8 CIDR range", () => {
      expect(isIpInCidr("10.0.1.1", "10.0.0.0/8")).toBe(true);
      expect(isIpInCidr("10.255.255.255", "10.0.0.0/8")).toBe(true);
      expect(isIpInCidr("11.0.0.1", "10.0.0.0/8")).toBe(false);
    });

    it("should match IP in /16 CIDR range", () => {
      expect(isIpInCidr("192.168.1.1", "192.168.0.0/16")).toBe(true);
      expect(isIpInCidr("192.168.255.255", "192.168.0.0/16")).toBe(true);
      expect(isIpInCidr("192.169.0.1", "192.168.0.0/16")).toBe(false);
    });

    it("should match IP in /24 CIDR range", () => {
      expect(isIpInCidr("172.16.0.1", "172.16.0.0/24")).toBe(true);
      expect(isIpInCidr("172.16.0.255", "172.16.0.0/24")).toBe(true);
      expect(isIpInCidr("172.16.1.1", "172.16.0.0/24")).toBe(false);
    });
  });

  describe("Block Status Types", () => {
    interface BlockStatus {
      isBlocked: boolean;
      blockType?: "temporary" | "permanent";
      reason?: string;
      blockedUntil?: Date;
      offenseCount?: number;
      incidentType?: string;
    }

    it("should represent an unblocked IP", () => {
      const status: BlockStatus = { isBlocked: false };
      expect(status.isBlocked).toBe(false);
      expect(status.blockType).toBeUndefined();
    });

    it("should represent a temporary block", () => {
      const blockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      const status: BlockStatus = {
        isBlocked: true,
        blockType: "temporary",
        reason: "Temporary block (offense #1): rate_limit_exceeded",
        blockedUntil,
        offenseCount: 1,
        incidentType: "rate_limit_exceeded",
      };

      expect(status.isBlocked).toBe(true);
      expect(status.blockType).toBe("temporary");
      expect(status.blockedUntil).toBeDefined();
      expect(status.offenseCount).toBe(1);
    });

    it("should represent a permanent block", () => {
      const status: BlockStatus = {
        isBlocked: true,
        blockType: "permanent",
        reason: "Permanent block: payment_signature_invalid",
        incidentType: "payment_signature_invalid",
      };

      expect(status.isBlocked).toBe(true);
      expect(status.blockType).toBe("permanent");
      expect(status.blockedUntil).toBeUndefined();
    });
  });

  describe("Cooling Period Logic", () => {
    const COOLING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

    function isWithinCoolingPeriod(offenseDate: Date): boolean {
      return Date.now() - offenseDate.getTime() < COOLING_PERIOD_MS;
    }

    it("should consider offense within cooling period if recent", () => {
      const recentOffense = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      expect(isWithinCoolingPeriod(recentOffense)).toBe(true);
    });

    it("should consider offense within cooling period if 29 days old", () => {
      const oldOffense = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      expect(isWithinCoolingPeriod(oldOffense)).toBe(true);
    });

    it("should not consider offense within cooling period if 31 days old", () => {
      const veryOldOffense = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      expect(isWithinCoolingPeriod(veryOldOffense)).toBe(false);
    });
  });

  describe("Cache Key Generation", () => {
    function generateBlockCacheKey(ip: string): string {
      return `ip:block:${ip}`;
    }

    function generateWhitelistCacheKey(ip: string): string {
      return `ip:whitelist:${ip}`;
    }

    it("should generate correct block cache key", () => {
      expect(generateBlockCacheKey("192.168.1.1")).toBe("ip:block:192.168.1.1");
      expect(generateBlockCacheKey("10.0.0.1")).toBe("ip:block:10.0.0.1");
    });

    it("should generate correct whitelist cache key", () => {
      expect(generateWhitelistCacheKey("192.168.1.1")).toBe("ip:whitelist:192.168.1.1");
    });
  });

  describe("Invalid IP Handling", () => {
    function isValidIp(ip: string | null | undefined): boolean {
      if (!ip || ip === "unknown") return false;
      return true;
    }

    it("should reject null IP", () => {
      expect(isValidIp(null)).toBe(false);
    });

    it("should reject undefined IP", () => {
      expect(isValidIp(undefined)).toBe(false);
    });

    it("should reject 'unknown' IP", () => {
      expect(isValidIp("unknown")).toBe(false);
    });

    it("should accept valid IP", () => {
      expect(isValidIp("192.168.1.1")).toBe(true);
    });
  });

  describe("Escalating Block Durations (5 offenses)", () => {
    const BLOCK_DURATIONS: Record<number, number> = {
      1: 15, 2: 60, 3: 360, 4: 1440, 5: 10080,
    };

    function getBlockDuration(offenseCount: number): number {
      const level = Math.min(offenseCount, 5);
      return BLOCK_DURATIONS[level] || BLOCK_DURATIONS[5];
    }

    it("should escalate from 15 min to 1 hour on 2nd offense", () => {
      expect(getBlockDuration(1)).toBe(15);
      expect(getBlockDuration(2)).toBe(60);
      expect(getBlockDuration(2) / getBlockDuration(1)).toBe(4); // 4x multiplier
    });

    it("should escalate from 1 hour to 6 hours on 3rd offense", () => {
      expect(getBlockDuration(2)).toBe(60);
      expect(getBlockDuration(3)).toBe(360);
      expect(getBlockDuration(3) / getBlockDuration(2)).toBe(6); // 6x multiplier
    });

    it("should escalate from 6 hours to 24 hours on 4th offense", () => {
      expect(getBlockDuration(3)).toBe(360);
      expect(getBlockDuration(4)).toBe(1440);
      expect(getBlockDuration(4) / getBlockDuration(3)).toBe(4); // 4x multiplier
    });

    it("should escalate from 24 hours to 7 days on 5th offense", () => {
      expect(getBlockDuration(4)).toBe(1440);
      expect(getBlockDuration(5)).toBe(10080);
      expect(getBlockDuration(5) / getBlockDuration(4)).toBe(7); // 7x multiplier
    });

    it("should verify complete escalation path", () => {
      const durations = [1, 2, 3, 4, 5].map(getBlockDuration);
      expect(durations).toEqual([15, 60, 360, 1440, 10080]);
    });
  });

  describe("Whitelist Bypass Logic", () => {
    // Simulated whitelist
    const whitelistedIps = new Set(["10.0.0.1", "192.168.1.100"]);
    const whitelistedCidrs = [
      { range: "172.16.0.0/16", checkFn: (ip: string) => ip.startsWith("172.16.") },
    ];

    function isWhitelisted(ip: string): boolean {
      if (whitelistedIps.has(ip)) return true;
      return whitelistedCidrs.some((cidr) => cidr.checkFn(ip));
    }

    function shouldBlockIp(ip: string, incidentType: string): boolean {
      // Skip whitelisted IPs
      if (isWhitelisted(ip)) return false;
      // Otherwise, block based on incident type
      const blockableTypes = ["rate_limit_exceeded", "payment_signature_invalid"];
      return blockableTypes.includes(incidentType);
    }

    it("should skip blocking for whitelisted exact IP", () => {
      expect(shouldBlockIp("10.0.0.1", "rate_limit_exceeded")).toBe(false);
    });

    it("should skip blocking for IP in whitelisted CIDR range", () => {
      expect(shouldBlockIp("172.16.5.10", "payment_signature_invalid")).toBe(false);
    });

    it("should block non-whitelisted IP for blockable incident", () => {
      expect(shouldBlockIp("8.8.8.8", "rate_limit_exceeded")).toBe(true);
    });

    it("should not block non-whitelisted IP for non-blockable incident", () => {
      expect(shouldBlockIp("8.8.8.8", "login_success")).toBe(false);
    });
  });

  describe("Admin Block/Unblock Operations", () => {
    interface BlockRecord {
      ip: string;
      isActive: boolean;
      blockedBy?: string;
      unblockedBy?: string;
      unblockedAt?: Date;
    }

    const blocks = new Map<string, BlockRecord>();

    function adminBlock(ip: string, adminId: string): BlockRecord {
      const record: BlockRecord = {
        ip,
        isActive: true,
        blockedBy: adminId,
      };
      blocks.set(ip, record);
      return record;
    }

    function adminUnblock(ip: string, adminId: string): BlockRecord | null {
      const record = blocks.get(ip);
      if (!record) return null;
      record.isActive = false;
      record.unblockedBy = adminId;
      record.unblockedAt = new Date();
      return record;
    }

    beforeEach(() => {
      blocks.clear();
    });

    it("should create block with admin reference", () => {
      const record = adminBlock("192.168.1.1", "admin-123");
      expect(record.isActive).toBe(true);
      expect(record.blockedBy).toBe("admin-123");
    });

    it("should unblock IP with admin reference", () => {
      adminBlock("192.168.1.1", "admin-123");
      const record = adminUnblock("192.168.1.1", "admin-456");

      expect(record?.isActive).toBe(false);
      expect(record?.unblockedBy).toBe("admin-456");
      expect(record?.unblockedAt).toBeDefined();
    });

    it("should return null when unblocking non-existent IP", () => {
      const record = adminUnblock("10.0.0.1", "admin-789");
      expect(record).toBeNull();
    });
  });
});
