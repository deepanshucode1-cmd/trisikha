import { describe, it, expect, beforeEach } from "vitest";

describe("Proxy IP Blocking Integration", () => {
  // Simulated state
  const blockedIps = new Map<string, { reason: string; blockedUntil?: string }>();
  const whitelistedIps = new Set<string>();

  // Protected routes that verify origin
  const PROTECTED_API_ROUTES = [
    "/api/checkout",
    "/api/orders/cancel",
    "/api/orders/send-cancel-otp",
    "/api/seller/",
    "/api/products",
    "/api/auth/signup",
  ];

  // Webhook routes bypass IP blocking (use signature verification)
  const WEBHOOK_ROUTES = ["/api/webhooks/"];

  function isProtectedRoute(pathname: string): boolean {
    return PROTECTED_API_ROUTES.some((route) => pathname.startsWith(route));
  }

  function isWebhookRoute(pathname: string): boolean {
    return WEBHOOK_ROUTES.some((route) => pathname.startsWith(route));
  }

  function isIpBlocked(ip: string): { blocked: boolean; reason?: string; blockedUntil?: string } {
    if (!ip || ip === "unknown") return { blocked: false };
    if (whitelistedIps.has(ip)) return { blocked: false };

    const block = blockedIps.get(ip);
    if (!block) return { blocked: false };

    // Check if temporary block expired
    if (block.blockedUntil) {
      if (new Date(block.blockedUntil) <= new Date()) {
        return { blocked: false };
      }
    }

    return { blocked: true, reason: block.reason, blockedUntil: block.blockedUntil };
  }

  interface ProxyRequest {
    pathname: string;
    method: string;
    ip: string;
    origin?: string;
    referer?: string;
    host: string;
  }

  interface ProxyResponse {
    status: number;
    error?: string;
    proceed?: boolean;
  }

  function simulateProxy(request: ProxyRequest): ProxyResponse {
    const { pathname, method, ip, origin, referer, host } = request;

    // Skip non-API routes
    if (!pathname.startsWith("/api/")) {
      return { status: 200, proceed: true };
    }

    // Skip webhooks - they use signature verification
    if (isWebhookRoute(pathname)) {
      return { status: 200, proceed: true };
    }

    // IP Blocking Check
    const blockCheck = isIpBlocked(ip);
    if (blockCheck.blocked) {
      return {
        status: 403,
        error: "Access denied",
      };
    }

    // Skip GET requests (read-only)
    if (method === "GET") {
      return { status: 200, proceed: true };
    }

    // Verify origin for protected routes
    if (isProtectedRoute(pathname)) {
      const allowedOrigins = [`https://${host}`, `http://${host}`];

      if (origin) {
        if (!allowedOrigins.includes(origin)) {
          return { status: 403, error: "Forbidden" };
        }
      } else if (referer) {
        const refererOrigin = new URL(referer).origin;
        if (!allowedOrigins.includes(refererOrigin)) {
          return { status: 403, error: "Forbidden" };
        }
      }
    }

    return { status: 200, proceed: true };
  }

  beforeEach(() => {
    blockedIps.clear();
    whitelistedIps.clear();
  });

  describe("IP Blocking in Proxy", () => {
    it("should return 403 for blocked IP", () => {
      blockedIps.set("192.168.1.1", { reason: "Rate limit exceeded" });

      const response = simulateProxy({
        pathname: "/api/checkout",
        method: "POST",
        ip: "192.168.1.1",
        host: "example.com",
      });

      expect(response.status).toBe(403);
      expect(response.error).toBe("Access denied");
    });

    it("should allow request for non-blocked IP", () => {
      const response = simulateProxy({
        pathname: "/api/checkout",
        method: "POST",
        ip: "192.168.1.1",
        origin: "https://example.com",
        host: "example.com",
      });

      expect(response.status).toBe(200);
      expect(response.proceed).toBe(true);
    });

    it("should allow request for expired temporary block", () => {
      const expiredTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      blockedIps.set("192.168.1.1", { reason: "Rate limit", blockedUntil: expiredTime });

      const response = simulateProxy({
        pathname: "/api/checkout",
        method: "POST",
        ip: "192.168.1.1",
        origin: "https://example.com",
        host: "example.com",
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Whitelist Bypass", () => {
    it("should allow whitelisted IP even if in blocklist", () => {
      blockedIps.set("10.0.0.1", { reason: "Rate limit exceeded" });
      whitelistedIps.add("10.0.0.1");

      const response = simulateProxy({
        pathname: "/api/checkout",
        method: "POST",
        ip: "10.0.0.1",
        origin: "https://example.com",
        host: "example.com",
      });

      expect(response.status).toBe(200);
      expect(response.proceed).toBe(true);
    });

    it("should allow Razorpay webhook IP if whitelisted", () => {
      whitelistedIps.add("52.66.100.100"); // Simulated Razorpay IP

      const response = simulateProxy({
        pathname: "/api/webhooks/razorpay/verify",
        method: "POST",
        ip: "52.66.100.100",
        host: "example.com",
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Webhook Bypass (Signature Verification)", () => {
    it("should bypass IP blocking for Razorpay webhook", () => {
      blockedIps.set("1.2.3.4", { reason: "Suspicious activity" });

      const response = simulateProxy({
        pathname: "/api/webhooks/razorpay/verify",
        method: "POST",
        ip: "1.2.3.4",
        host: "example.com",
      });

      // Webhook bypasses IP check - uses signature verification instead
      expect(response.status).toBe(200);
      expect(response.proceed).toBe(true);
    });

    it("should bypass IP blocking for Razorpay refund webhook", () => {
      blockedIps.set("5.6.7.8", { reason: "Blocked" });

      const response = simulateProxy({
        pathname: "/api/webhooks/razorpay/refund",
        method: "POST",
        ip: "5.6.7.8",
        host: "example.com",
      });

      expect(response.status).toBe(200);
    });

    it("should bypass IP blocking for Shiprocket webhook", () => {
      blockedIps.set("9.10.11.12", { reason: "Blocked" });

      const response = simulateProxy({
        pathname: "/api/webhooks/shiprocket",
        method: "POST",
        ip: "9.10.11.12",
        host: "example.com",
      });

      expect(response.status).toBe(200);
    });

    it("should bypass IP blocking for monitoring webhook", () => {
      blockedIps.set("13.14.15.16", { reason: "Blocked" });

      const response = simulateProxy({
        pathname: "/api/webhooks/monitoring",
        method: "POST",
        ip: "13.14.15.16",
        host: "example.com",
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Origin Verification Still Works", () => {
    it("should reject POST to protected route with wrong origin", () => {
      const response = simulateProxy({
        pathname: "/api/checkout",
        method: "POST",
        ip: "192.168.1.1",
        origin: "https://malicious-site.com",
        host: "example.com",
      });

      expect(response.status).toBe(403);
      expect(response.error).toBe("Forbidden");
    });

    it("should allow POST to protected route with correct origin", () => {
      const response = simulateProxy({
        pathname: "/api/checkout",
        method: "POST",
        ip: "192.168.1.1",
        origin: "https://example.com",
        host: "example.com",
      });

      expect(response.status).toBe(200);
    });

    it("should allow POST to protected route with correct referer", () => {
      const response = simulateProxy({
        pathname: "/api/checkout",
        method: "POST",
        ip: "192.168.1.1",
        referer: "https://example.com/buy-now",
        host: "example.com",
      });

      expect(response.status).toBe(200);
    });

    it("should check IP block BEFORE origin verification", () => {
      blockedIps.set("192.168.1.1", { reason: "Blocked" });

      const response = simulateProxy({
        pathname: "/api/checkout",
        method: "POST",
        ip: "192.168.1.1",
        origin: "https://example.com", // Valid origin
        host: "example.com",
      });

      // Should be blocked by IP check, not reach origin check
      expect(response.status).toBe(403);
      expect(response.error).toBe("Access denied");
    });

    it("should allow GET requests without origin check", () => {
      const response = simulateProxy({
        pathname: "/api/checkout",
        method: "GET",
        ip: "192.168.1.1",
        host: "example.com",
        // No origin or referer
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Non-API Routes", () => {
    it("should skip IP blocking for non-API routes", () => {
      blockedIps.set("192.168.1.1", { reason: "Blocked" });

      const response = simulateProxy({
        pathname: "/products",
        method: "GET",
        ip: "192.168.1.1",
        host: "example.com",
      });

      expect(response.status).toBe(200);
      expect(response.proceed).toBe(true);
    });

    it("should skip IP blocking for page routes", () => {
      blockedIps.set("10.0.0.1", { reason: "Blocked" });

      const response = simulateProxy({
        pathname: "/checkout",
        method: "GET",
        ip: "10.0.0.1",
        host: "example.com",
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Edge Cases", () => {
    it("should handle unknown IP gracefully", () => {
      const response = simulateProxy({
        pathname: "/api/checkout",
        method: "POST",
        ip: "unknown",
        origin: "https://example.com",
        host: "example.com",
      });

      expect(response.status).toBe(200);
    });

    it("should handle empty IP gracefully", () => {
      const response = simulateProxy({
        pathname: "/api/checkout",
        method: "POST",
        ip: "",
        origin: "https://example.com",
        host: "example.com",
      });

      expect(response.status).toBe(200);
    });
  });
});
