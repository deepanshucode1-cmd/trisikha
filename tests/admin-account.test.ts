/**
 * tests/admin-account.test.ts
 *
 * Unit tests for:
 *   app/api/admin/account/lock/route.ts
 *   app/api/admin/account/unlock/route.ts
 *
 * Covers:
 *   A — CSRF protection
 *   B — Rate limiting
 *   C — Authentication & authorization
 *   D — Input validation
 *   E — Business logic (lock/unlock)
 *   F — Self-lockout prevention (lock only)
 *   G — Error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockRequireCsrf,
  mockRateLimit,
  mockGetClientIp,
  mockRequireRole,
  mockHandleAuthError,
  mockLockAccount,
  mockUnlockAccount,
  mockSanitizeObject,
  mockLogAuth,
  mockLogError,
} = vi.hoisted(() => ({
  mockRequireCsrf: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  mockRequireRole: vi.fn(),
  mockHandleAuthError: vi.fn(),
  mockLockAccount: vi.fn(),
  mockUnlockAccount: vi.fn(),
  mockSanitizeObject: vi.fn((o: unknown) => o),
  mockLogAuth: vi.fn(),
  mockLogError: vi.fn(),
}));

// ─── Module mocks ───────────────────────────────────────────────────────────────

vi.mock("@/lib/csrf", () => ({
  requireCsrf: mockRequireCsrf,
}));

vi.mock("@/lib/rate-limit", () => ({
  adminShippingRateLimit: { limit: mockRateLimit },
  getClientIp: mockGetClientIp,
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mockRequireRole,
  handleAuthError: mockHandleAuthError,
}));

vi.mock("@/lib/incident", () => ({
  lockAccount: mockLockAccount,
  unlockAccount: mockUnlockAccount,
}));

vi.mock("@/lib/xss", () => ({
  sanitizeObject: mockSanitizeObject,
}));

vi.mock("@/lib/logger", () => ({
  logAuth: mockLogAuth,
  logError: mockLogError,
}));

// ─── Import handlers after mocks ────────────────────────────────────────────────

import { POST as lockPOST } from "@/app/api/admin/account/lock/route";
import { POST as unlockPOST } from "@/app/api/admin/account/unlock/route";

// ─── Constants ──────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = "admin-uuid-1111";
const TARGET_USER_ID = "target-uuid-2222";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeLockRequest(body: object): Request {
  return new Request("http://localhost/api/admin/account/lock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeUnlockRequest(body: object): Request {
  return new Request("http://localhost/api/admin/account/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: CSRF passes
  mockRequireCsrf.mockResolvedValue({ valid: true });

  // Default: rate limit passes
  mockRateLimit.mockResolvedValue({ success: true });

  // Default: user is authenticated as admin
  mockRequireRole.mockResolvedValue({ user: { id: ADMIN_USER_ID } });

  // Default: handleAuthError returns a 401 for auth errors
  mockHandleAuthError.mockReturnValue(
    new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  );

  // Default: business logic succeeds
  mockLockAccount.mockResolvedValue(undefined);
  mockUnlockAccount.mockResolvedValue(undefined);

  // Default: sanitizeObject passes through
  mockSanitizeObject.mockImplementation((o: unknown) => o);
});

// ─── LOCK ROUTE ─────────────────────────────────────────────────────────────────

describe("POST /api/admin/account/lock", () => {
  // ─── A: CSRF Protection ─────────────────────────────────────────────────────

  describe("A — CSRF protection", () => {
    it("A1: invalid CSRF token → 403", async () => {
      mockRequireCsrf.mockResolvedValue({
        valid: false,
        error: "Invalid CSRF token",
      });

      const res = await lockPOST(
        makeLockRequest({ userId: TARGET_USER_ID, reason: "Suspicious activity" })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Invalid CSRF token");
    });
  });

  // ─── B: Rate Limiting ───────────────────────────────────────────────────────

  describe("B — rate limiting", () => {
    it("B1: rate limit exceeded → 429", async () => {
      mockRateLimit.mockResolvedValue({ success: false });

      const res = await lockPOST(
        makeLockRequest({ userId: TARGET_USER_ID, reason: "Test" })
      );

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toMatch(/too many requests/i);
    });
  });

  // ─── C: Authentication & Authorization ─────────────────────────────────────

  describe("C — authentication & authorization", () => {
    it("C1: unauthenticated → returns auth error response", async () => {
      const authError = new Error("Unauthorized");
      mockRequireRole.mockRejectedValue(authError);
      mockHandleAuthError.mockReturnValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
      );

      const res = await lockPOST(
        makeLockRequest({ userId: TARGET_USER_ID, reason: "Test" })
      );

      expect(res.status).toBe(401);
    });

    it("C2: non-admin user → returns forbidden response", async () => {
      const forbiddenError = new Error("Forbidden");
      mockRequireRole.mockRejectedValue(forbiddenError);
      mockHandleAuthError.mockReturnValue(
        new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
      );

      const res = await lockPOST(
        makeLockRequest({ userId: TARGET_USER_ID, reason: "Test" })
      );

      expect(res.status).toBe(403);
    });
  });

  // ─── D: Input Validation ────────────────────────────────────────────────────

  describe("D — input validation", () => {
    it("D1: missing userId → 400", async () => {
      const res = await lockPOST(makeLockRequest({ reason: "Test reason" }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/missing userid or reason/i);
    });

    it("D2: missing reason → 400", async () => {
      const res = await lockPOST(
        makeLockRequest({ userId: TARGET_USER_ID })
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/missing userid or reason/i);
    });

    it("D3: missing both userId and reason → 400", async () => {
      const res = await lockPOST(makeLockRequest({}));

      expect(res.status).toBe(400);
    });
  });

  // ─── E: Business Logic ──────────────────────────────────────────────────────

  describe("E — business logic", () => {
    it("E1: valid request → 200 success", async () => {
      const res = await lockPOST(
        makeLockRequest({
          userId: TARGET_USER_ID,
          reason: "Suspicious activity",
        })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("E2: calls lockAccount with correct params", async () => {
      await lockPOST(
        makeLockRequest({
          userId: TARGET_USER_ID,
          reason: "Suspicious activity",
          durationHours: 48,
        })
      );

      expect(mockLockAccount).toHaveBeenCalledWith(
        TARGET_USER_ID,
        "Suspicious activity",
        48
      );
    });

    it("E3: defaults durationHours to 24 when not provided", async () => {
      await lockPOST(
        makeLockRequest({
          userId: TARGET_USER_ID,
          reason: "Suspicious activity",
        })
      );

      expect(mockLockAccount).toHaveBeenCalledWith(
        TARGET_USER_ID,
        "Suspicious activity",
        24
      );
    });

    it("E4: logs admin action after successful lock", async () => {
      await lockPOST(
        makeLockRequest({
          userId: TARGET_USER_ID,
          reason: "Suspicious activity",
        })
      );

      expect(mockLogAuth).toHaveBeenCalledWith(
        "admin_lock_account",
        expect.objectContaining({
          adminId: ADMIN_USER_ID,
          targetUserId: TARGET_USER_ID,
        })
      );
    });
  });

  // ─── F: Self-Lockout Prevention ─────────────────────────────────────────────

  describe("F — self-lockout prevention", () => {
    it("F1: admin cannot lock their own account → 400", async () => {
      const res = await lockPOST(
        makeLockRequest({
          userId: ADMIN_USER_ID, // same as authenticated admin
          reason: "Test",
        })
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/cannot lock your own account/i);
    });

    it("F1b: lockAccount should NOT be called on self-lockout attempt", async () => {
      await lockPOST(
        makeLockRequest({
          userId: ADMIN_USER_ID,
          reason: "Test",
        })
      );

      expect(mockLockAccount).not.toHaveBeenCalled();
    });
  });

  // ─── G: Error Handling ──────────────────────────────────────────────────────

  describe("G — error handling", () => {
    it("G1: lockAccount throws → 500", async () => {
      mockLockAccount.mockRejectedValue(new Error("DB error"));
      // handleAuthError returns 500 status for non-auth errors
      mockHandleAuthError.mockReturnValue(
        new Response(JSON.stringify({ error: "Internal" }), { status: 500 })
      );

      const res = await lockPOST(
        makeLockRequest({
          userId: TARGET_USER_ID,
          reason: "Test",
        })
      );

      expect(res.status).toBe(500);
    });

    it("G2: logError is called on unexpected error", async () => {
      const err = new Error("Unexpected DB error");
      mockLockAccount.mockRejectedValue(err);
      // handleAuthError returns 500 to indicate it's a generic error
      mockHandleAuthError.mockReturnValue(
        new Response(JSON.stringify({ error: "Internal" }), { status: 500 })
      );

      await lockPOST(
        makeLockRequest({
          userId: TARGET_USER_ID,
          reason: "Test",
        })
      );

      expect(mockLogError).toHaveBeenCalledWith(
        err,
        expect.objectContaining({ endpoint: "/api/admin/account/lock" })
      );
    });
  });
});

// ─── UNLOCK ROUTE ───────────────────────────────────────────────────────────────

describe("POST /api/admin/account/unlock", () => {
  // ─── A: CSRF Protection ─────────────────────────────────────────────────────

  describe("A — CSRF protection", () => {
    it("A1: invalid CSRF token → 403", async () => {
      mockRequireCsrf.mockResolvedValue({
        valid: false,
        error: "CSRF token missing",
      });

      const res = await unlockPOST(
        makeUnlockRequest({ userId: TARGET_USER_ID })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("CSRF token missing");
    });
  });

  // ─── B: Rate Limiting ───────────────────────────────────────────────────────

  describe("B — rate limiting", () => {
    it("B1: rate limit exceeded → 429", async () => {
      mockRateLimit.mockResolvedValue({ success: false });

      const res = await unlockPOST(makeUnlockRequest({ userId: TARGET_USER_ID }));

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toMatch(/too many requests/i);
    });
  });

  // ─── C: Authentication & Authorization ─────────────────────────────────────

  describe("C — authentication & authorization", () => {
    it("C1: unauthenticated → returns auth error response", async () => {
      mockRequireRole.mockRejectedValue(new Error("Unauthorized"));
      mockHandleAuthError.mockReturnValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
      );

      const res = await unlockPOST(makeUnlockRequest({ userId: TARGET_USER_ID }));

      expect(res.status).toBe(401);
    });
  });

  // ─── D: Input Validation ────────────────────────────────────────────────────

  describe("D — input validation", () => {
    it("D1: missing userId → 400", async () => {
      const res = await unlockPOST(makeUnlockRequest({}));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/missing userid/i);
    });
  });

  // ─── E: Business Logic ──────────────────────────────────────────────────────

  describe("E — business logic", () => {
    it("E1: valid request → 200 success", async () => {
      const res = await unlockPOST(makeUnlockRequest({ userId: TARGET_USER_ID }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("E2: calls unlockAccount with correct params", async () => {
      await unlockPOST(makeUnlockRequest({ userId: TARGET_USER_ID }));

      expect(mockUnlockAccount).toHaveBeenCalledWith(TARGET_USER_ID, ADMIN_USER_ID);
    });

    it("E3: logs admin action after successful unlock", async () => {
      await unlockPOST(makeUnlockRequest({ userId: TARGET_USER_ID }));

      expect(mockLogAuth).toHaveBeenCalledWith(
        "admin_unlock_account",
        expect.objectContaining({
          adminId: ADMIN_USER_ID,
          targetUserId: TARGET_USER_ID,
        })
      );
    });
  });

  // ─── F: Error Handling ──────────────────────────────────────────────────────

  describe("F — error handling", () => {
    it("F1: unlockAccount throws → 500", async () => {
      mockUnlockAccount.mockRejectedValue(new Error("DB error"));
      mockHandleAuthError.mockReturnValue(
        new Response(JSON.stringify({ error: "Internal" }), { status: 500 })
      );

      const res = await unlockPOST(makeUnlockRequest({ userId: TARGET_USER_ID }));

      expect(res.status).toBe(500);
    });

    it("F2: logError is called on unexpected error", async () => {
      const err = new Error("DB connection failed");
      mockUnlockAccount.mockRejectedValue(err);
      mockHandleAuthError.mockReturnValue(
        new Response(JSON.stringify({ error: "Internal" }), { status: 500 })
      );

      await unlockPOST(makeUnlockRequest({ userId: TARGET_USER_ID }));

      expect(mockLogError).toHaveBeenCalledWith(
        err,
        expect.objectContaining({ endpoint: "/api/admin/account/unlock" })
      );
    });
  });
});