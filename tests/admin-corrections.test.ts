/**
 * tests/admin-corrections.test.ts
 *
 * Unit tests for:
 *   app/api/admin/corrections/route.ts          (GET - list all corrections)
 *   app/api/admin/corrections/[id]/route.ts     (GET - single, POST - process)
 *
 * Covers:
 *   A — Authentication (unauthenticated)
 *   B — Authorization (non-admin)
 *   C — Business logic (happy path)
 *   D — Input validation (corrections/[id] POST)
 *   E — Not found handling
 *   F — Error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockGetUser,
  mockUserRoleSingle,
  mockGetCorrectionRequests,
  mockGetCorrectionRequestStats,
  mockGetCorrectionRequestById,
  mockProcessCorrectionRequest,
  mockSanitizeObject,
  mockLogError,
  mockGetFirstZodError,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUserRoleSingle: vi.fn(),
  mockGetCorrectionRequests: vi.fn(),
  mockGetCorrectionRequestStats: vi.fn(),
  mockGetCorrectionRequestById: vi.fn(),
  mockProcessCorrectionRequest: vi.fn(),
  mockSanitizeObject: vi.fn((o: unknown) => o),
  mockLogError: vi.fn(),
  mockGetFirstZodError: vi.fn().mockReturnValue("Validation error"),
}));

// ─── Module mocks ───────────────────────────────────────────────────────────────

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "user_role") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: mockUserRoleSingle,
            }),
          }),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    },
  })),
}));

vi.mock("@/lib/correction-request", () => ({
  getCorrectionRequests: mockGetCorrectionRequests,
  getCorrectionRequestStats: mockGetCorrectionRequestStats,
  processCorrectionRequest: mockProcessCorrectionRequest,
}));

vi.mock("@/lib/logger", () => ({
  logError: mockLogError,
  logSecurityEvent: vi.fn(),
}));

vi.mock("@/lib/errors", () => ({
  getFirstZodError: mockGetFirstZodError,
}));

vi.mock("@/lib/xss", () => ({
  sanitizeObject: mockSanitizeObject,
}));

// createServiceClient is also used in corrections/[id]
vi.mock("@/utils/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "correction_requests") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: mockGetCorrectionRequestById,
            }),
          }),
        };
      }
      return {};
    },
  })),
}));

// ─── Import handlers after mocks ────────────────────────────────────────────────

import { GET as listGET } from "@/app/api/admin/corrections/route";
import {
  GET as getByIdGET,
  POST as processIdPOST,
} from "@/app/api/admin/corrections/[id]/route";

// ─── Constants ──────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = "admin-uuid-aaaa";
const CORRECTION_ID = "corr-uuid-1111";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeListRequest(params?: Record<string, string>): Request {
  const url = new URL("http://localhost/api/admin/corrections");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new Request(url.toString(), { method: "GET" });
}

function makeGetByIdRequest(): Request {
  return new Request(`http://localhost/api/admin/corrections/${CORRECTION_ID}`, {
    method: "GET",
  });
}

function makeProcessRequest(body: object): Request {
  return new Request(`http://localhost/api/admin/corrections/${CORRECTION_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id = CORRECTION_ID): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

function mockAdminUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN_USER_ID } } });
  mockUserRoleSingle.mockResolvedValue({
    data: { role: "admin" },
    error: null,
  });
}

const sampleCorrectionRequest = {
  id: CORRECTION_ID,
  email: "customer@example.com",
  order_id: "order-uuid-9999",
  field_name: "name",
  current_value: "Old Name",
  requested_value: "New Name",
  status: "pending",
  admin_notes: null,
  processed_at: null,
  processed_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  mockAdminUser();

  mockGetCorrectionRequests.mockResolvedValue({
    requests: [sampleCorrectionRequest],
    total: 1,
  });
  mockGetCorrectionRequestStats.mockResolvedValue({
    pending: 1,
    approved: 0,
    rejected: 0,
  });
  mockGetCorrectionRequestById.mockResolvedValue({
    data: sampleCorrectionRequest,
    error: null,
  });
  mockProcessCorrectionRequest.mockResolvedValue({
    success: true,
    message: "Correction request approved",
  });
  mockSanitizeObject.mockImplementation((o: unknown) => o);
});

// ─── GET /api/admin/corrections ─────────────────────────────────────────────────

describe("GET /api/admin/corrections", () => {
  describe("A — authentication", () => {
    it("A1: unauthenticated → 401", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await listGET(makeListRequest());

      expect(res.status).toBe(401);
      expect((await res.json()).error).toMatch(/unauthorized/i);
    });
  });

  describe("B — authorization", () => {
    it("B1: non-admin user → 403", async () => {
      mockUserRoleSingle.mockResolvedValue({
        data: { role: "user" },
        error: null,
      });

      const res = await listGET(makeListRequest());

      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/forbidden/i);
    });

    it("B2: user role query error → 403", async () => {
      mockUserRoleSingle.mockResolvedValue({
        data: null,
        error: { message: "Not found" },
      });

      const res = await listGET(makeListRequest());

      expect(res.status).toBe(403);
    });

    it("B3: super_admin role is allowed", async () => {
      mockUserRoleSingle.mockResolvedValue({
        data: { role: "super_admin" },
        error: null,
      });

      const res = await listGET(makeListRequest());

      expect(res.status).toBe(200);
    });
  });

  describe("C — happy path", () => {
    it("C1: returns requests, total, stats", async () => {
      const res = await listGET(makeListRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.requests).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.stats).toBeDefined();
    });

    it("C2: passes status filter to getCorrectionRequests", async () => {
      await listGET(makeListRequest({ status: "pending" }));

      expect(mockGetCorrectionRequests).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pending" })
      );
    });

    it("C3: passes email filter to getCorrectionRequests", async () => {
      await listGET(makeListRequest({ email: "test@example.com" }));

      expect(mockGetCorrectionRequests).toHaveBeenCalledWith(
        expect.objectContaining({ email: "test@example.com" })
      );
    });

    it("C4: uses default limit=20 and offset=0 when not specified", async () => {
      await listGET(makeListRequest());

      expect(mockGetCorrectionRequests).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20, offset: 0 })
      );
    });

    it("C5: respects custom limit and offset query params", async () => {
      await listGET(makeListRequest({ limit: "50", offset: "10" }));

      expect(mockGetCorrectionRequests).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50, offset: 10 })
      );
    });
  });

  describe("F — error handling", () => {
    it("F1: getCorrectionRequests throws → 500", async () => {
      mockGetCorrectionRequests.mockRejectedValue(new Error("DB error"));

      const res = await listGET(makeListRequest());

      expect(res.status).toBe(500);
      expect((await res.json()).error).toMatch(/internal server error/i);
    });
  });
});

// ─── GET /api/admin/corrections/[id] ────────────────────────────────────────────

describe("GET /api/admin/corrections/[id]", () => {
  describe("A — authentication", () => {
    it("A1: unauthenticated → 401", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await getByIdGET(makeGetByIdRequest(), { params: makeParams() });

      expect(res.status).toBe(401);
    });
  });

  describe("B — authorization", () => {
    it("B1: non-admin → 403", async () => {
      mockUserRoleSingle.mockResolvedValue({
        data: { role: "viewer" },
        error: null,
      });

      const res = await getByIdGET(makeGetByIdRequest(), { params: makeParams() });

      expect(res.status).toBe(403);
    });
  });

  describe("C — happy path", () => {
    it("C1: returns correction request", async () => {
      const res = await getByIdGET(makeGetByIdRequest(), { params: makeParams() });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.request.id).toBe(CORRECTION_ID);
    });
  });

  describe("E — not found", () => {
    it("E1: correction request not found → 404", async () => {
      mockGetCorrectionRequestById.mockResolvedValue({ data: null, error: null });

      const res = await getByIdGET(makeGetByIdRequest(), { params: makeParams() });

      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatch(/not found/i);
    });

    it("E2: DB error fetching correction → 404", async () => {
      mockGetCorrectionRequestById.mockResolvedValue({
        data: null,
        error: { message: "DB error" },
      });

      const res = await getByIdGET(makeGetByIdRequest(), { params: makeParams() });

      expect(res.status).toBe(404);
    });
  });
});

// ─── POST /api/admin/corrections/[id] ───────────────────────────────────────────

describe("POST /api/admin/corrections/[id]", () => {
  describe("A — authentication", () => {
    it("A1: unauthenticated → 401", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await processIdPOST(makeProcessRequest({ action: "approved" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("B — authorization", () => {
    it("B1: non-admin → 403", async () => {
      mockUserRoleSingle.mockResolvedValue({
        data: { role: "support" },
        error: null,
      });

      const res = await processIdPOST(makeProcessRequest({ action: "approved" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(403);
    });
  });

  describe("C — happy path", () => {
    it("C1: approve correction → 200 with message", async () => {
      const res = await processIdPOST(makeProcessRequest({ action: "approved" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBeDefined();
    });

    it("C2: reject correction → 200 with message", async () => {
      mockProcessCorrectionRequest.mockResolvedValue({
        success: true,
        message: "Correction request rejected",
      });

      const res = await processIdPOST(makeProcessRequest({ action: "rejected" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(200);
    });

    it("C3: calls processCorrectionRequest with correct params", async () => {
      await processIdPOST(
        makeProcessRequest({ action: "approved", adminNotes: "Looks valid" }),
        { params: makeParams() }
      );

      expect(mockProcessCorrectionRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: CORRECTION_ID,
          action: "approved",
          adminId: ADMIN_USER_ID,
          adminNotes: "Looks valid",
        })
      );
    });
  });

  describe("D — input validation", () => {
    it("D1: invalid action value → 400", async () => {
      const res = await processIdPOST(
        makeProcessRequest({ action: "invalid-action" }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
    });

    it("D2: missing action → 400", async () => {
      const res = await processIdPOST(makeProcessRequest({}), {
        params: makeParams(),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("E — not found / business logic failure", () => {
    it("E1: processCorrectionRequest returns failure → 400", async () => {
      mockProcessCorrectionRequest.mockResolvedValue({
        success: false,
        message: "Request already processed",
      });

      const res = await processIdPOST(makeProcessRequest({ action: "approved" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/already processed/i);
    });
  });

  describe("F — error handling", () => {
    it("F1: processCorrectionRequest throws → 500", async () => {
      mockProcessCorrectionRequest.mockRejectedValue(new Error("DB error"));

      const res = await processIdPOST(makeProcessRequest({ action: "approved" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(500);
    });

    it("F2: logError called on unexpected error", async () => {
      mockProcessCorrectionRequest.mockRejectedValue(new Error("Unexpected"));

      await processIdPOST(makeProcessRequest({ action: "approved" }), {
        params: makeParams(),
      });

      expect(mockLogError).toHaveBeenCalled();
    });
  });
});