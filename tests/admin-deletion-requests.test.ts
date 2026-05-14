/**
 * tests/admin-deletion-requests.test.ts
 *
 * Unit tests for:
 *   app/api/admin/deletion-requests/route.ts             (GET - list)
 *   app/api/admin/deletion-requests/stats/route.ts       (GET - stats)
 *   app/api/admin/deletion-requests/[id]/route.ts        (GET - single, POST - execute)
 *   app/api/admin/deletion-requests/bulk-execute/route.ts (POST - bulk execute)
 *
 * Covers:
 *   A — Authentication (unauthenticated)
 *   B — Authorization (non-admin)
 *   C — Happy path / business logic
 *   D — Input validation
 *   E — Not found / invalid state
 *   F — Error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockGetUser,
  mockUserRoleSingle,
  mockOrdersSelect,
  mockIncidentSelect,
  mockGetDeletionRequests,
  mockGetDeletionRequestStats,
  mockGetDeletionRequestById,
  mockExecuteDeletionRequest,
  mockSendDeletionCompleted,
  mockLogError,
  mockLogSecurityEvent,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUserRoleSingle: vi.fn(),
  mockOrdersSelect: vi.fn(),
  mockIncidentSelect: vi.fn(),
  mockGetDeletionRequests: vi.fn(),
  mockGetDeletionRequestStats: vi.fn(),
  mockGetDeletionRequestById: vi.fn(),
  mockExecuteDeletionRequest: vi.fn(),
  mockSendDeletionCompleted: vi.fn(),
  mockLogError: vi.fn(),
  mockLogSecurityEvent: vi.fn(),
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
      if (table === "orders") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue(mockOrdersSelect()),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: mockIncidentSelect,
      };
    },
  })),
}));

vi.mock("@/lib/deletion-request", () => ({
  getDeletionRequests: mockGetDeletionRequests,
  getDeletionRequestStats: mockGetDeletionRequestStats,
  getDeletionRequestById: mockGetDeletionRequestById,
  executeDeletionRequest: mockExecuteDeletionRequest,
}));

vi.mock("@/lib/email", () => ({
  sendDeletionCompleted: mockSendDeletionCompleted,
}));

vi.mock("@/lib/logger", () => ({
  logError: mockLogError,
  logSecurityEvent: mockLogSecurityEvent,
}));

// ─── Import handlers after mocks ────────────────────────────────────────────────

import { GET as listGET } from "@/app/api/admin/deletion-requests/route";
import { GET as statsGET } from "@/app/api/admin/deletion-requests/stats/route";
import {
  GET as getByIdGET,
  POST as executeByIdPOST,
} from "@/app/api/admin/deletion-requests/[id]/route";
import { POST as bulkExecutePOST } from "@/app/api/admin/deletion-requests/bulk-execute/route";

// ─── Constants ──────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = "admin-uuid-dddd";
const REQUEST_ID_1 = "del-req-uuid-1111";
const REQUEST_ID_2 = "del-req-uuid-2222";
const GUEST_EMAIL = "guest@example.com";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeListRequest(params?: Record<string, string>): Request {
  const url = new URL("http://localhost/api/admin/deletion-requests");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" });
}

function makeStatsRequest(): Request {
  return new Request("http://localhost/api/admin/deletion-requests/stats", {
    method: "GET",
  });
}

function makeGetByIdRequest(): Request {
  return new Request(
    `http://localhost/api/admin/deletion-requests/${REQUEST_ID_1}`,
    { method: "GET" }
  );
}

function makeExecuteRequest(): Request {
  return new Request(
    `http://localhost/api/admin/deletion-requests/${REQUEST_ID_1}`,
    { method: "POST" }
  );
}

function makeBulkRequest(body: object): Request {
  return new Request(
    "http://localhost/api/admin/deletion-requests/bulk-execute",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function makeParams(id = REQUEST_ID_1): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

function mockAdminUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN_USER_ID } } });
  mockUserRoleSingle.mockResolvedValue({ data: { role: "admin" }, error: null });
}

const sampleRequest = {
  id: REQUEST_ID_1,
  guest_email: GUEST_EMAIL,
  status: "pending",
  requested_at: new Date().toISOString(),
  executed_at: null,
  executed_by: null,
  notes: null,
};

const sampleStats = {
  pending: 3,
  eligible: 1,
  failed: 0,
  completed: 5,
  deferred_legal: 2,
};

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  mockAdminUser();

  mockGetDeletionRequests.mockResolvedValue({
    requests: [sampleRequest],
    total: 1,
  });
  mockGetDeletionRequestStats.mockResolvedValue(sampleStats);
  mockGetDeletionRequestById.mockResolvedValue(sampleRequest);
  mockOrdersSelect.mockReturnValue({ data: [], error: null });
  mockExecuteDeletionRequest.mockResolvedValue({
    success: true,
    status: "completed",
    message: "Data deleted",
    ordersDeleted: 2,
    otpCleared: true,
    hasPaidOrders: false,
    paidOrdersCount: 0,
  });
  mockSendDeletionCompleted.mockResolvedValue(undefined);
});

// ─── GET /api/admin/deletion-requests ───────────────────────────────────────────

describe("GET /api/admin/deletion-requests", () => {
  describe("A — authentication", () => {
    it("A1: unauthenticated → 401", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await listGET(makeListRequest());

      expect(res.status).toBe(401);
    });
  });

  describe("B — authorization", () => {
    it("B1: non-admin role → 403", async () => {
      mockUserRoleSingle.mockResolvedValue({ data: { role: "user" }, error: null });

      const res = await listGET(makeListRequest());

      expect(res.status).toBe(403);
    });

    it("B2: super_admin is allowed", async () => {
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

    it("C2: passes single status filter", async () => {
      await listGET(makeListRequest({ status: "pending" }));

      expect(mockGetDeletionRequests).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pending" })
      );
    });

    it("C3: parses comma-separated status into array", async () => {
      await listGET(makeListRequest({ status: "pending,eligible" }));

      expect(mockGetDeletionRequests).toHaveBeenCalledWith(
        expect.objectContaining({ status: ["pending", "eligible"] })
      );
    });

    it("C4: uses default pagination when not specified", async () => {
      await listGET(makeListRequest());

      expect(mockGetDeletionRequests).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20, offset: 0 })
      );
    });

    it("C5: email filter is passed through", async () => {
      await listGET(makeListRequest({ email: "user@test.com" }));

      expect(mockGetDeletionRequests).toHaveBeenCalledWith(
        expect.objectContaining({ email: "user@test.com" })
      );
    });
  });

  describe("F — error handling", () => {
    it("F1: getDeletionRequests throws → 500", async () => {
      mockGetDeletionRequests.mockRejectedValue(new Error("DB error"));

      const res = await listGET(makeListRequest());

      expect(res.status).toBe(500);
    });
  });
});

// ─── GET /api/admin/deletion-requests/stats ─────────────────────────────────────

describe("GET /api/admin/deletion-requests/stats", () => {
  describe("A — authentication", () => {
    it("A1: unauthenticated → 401", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await statsGET();

      expect(res.status).toBe(401);
    });
  });

  describe("B — authorization", () => {
    it("B1: non-admin → 403", async () => {
      mockUserRoleSingle.mockResolvedValue({ data: { role: "viewer" }, error: null });

      const res = await statsGET();

      expect(res.status).toBe(403);
    });
  });

  describe("C — happy path", () => {
    it("C1: returns stats with actionRequired count", async () => {
      const res = await statsGET();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.stats).toMatchObject(sampleStats);
      // actionRequired = eligible + failed
      expect(body.actionRequired).toBe(sampleStats.eligible + sampleStats.failed);
    });

    it("C2: actionRequired = 0 when eligible and failed both 0", async () => {
      mockGetDeletionRequestStats.mockResolvedValue({
        ...sampleStats,
        eligible: 0,
        failed: 0,
      });

      const res = await statsGET();
      const body = await res.json();

      expect(body.actionRequired).toBe(0);
    });
  });

  describe("F — error handling", () => {
    it("F1: getDeletionRequestStats throws → 500", async () => {
      mockGetDeletionRequestStats.mockRejectedValue(new Error("DB error"));

      const res = await statsGET();

      expect(res.status).toBe(500);
    });
  });
});

// ─── GET /api/admin/deletion-requests/[id] ──────────────────────────────────────

describe("GET /api/admin/deletion-requests/[id]", () => {
  describe("A — authentication", () => {
    it("A1: unauthenticated → 401", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await getByIdGET(makeGetByIdRequest(), { params: makeParams() });

      expect(res.status).toBe(401);
    });
  });

  describe("B — authorization", () => {
    it("B1: non-admin → 403", async () => {
      mockUserRoleSingle.mockResolvedValue({ data: { role: "user" }, error: null });

      const res = await getByIdGET(makeGetByIdRequest(), { params: makeParams() });

      expect(res.status).toBe(403);
    });
  });

  describe("C — happy path", () => {
    it("C1: returns deletion request with summary", async () => {
      const res = await getByIdGET(makeGetByIdRequest(), { params: makeParams() });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.request.id).toBe(REQUEST_ID_1);
      expect(body.summary).toBeDefined();
    });
  });

  describe("E — not found", () => {
    it("E1: deletion request not found → 404", async () => {
      mockGetDeletionRequestById.mockResolvedValue(null);

      const res = await getByIdGET(makeGetByIdRequest(), { params: makeParams() });

      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatch(/not found/i);
    });
  });

  describe("F — error handling", () => {
    it("F1: getDeletionRequestById throws → 500", async () => {
      mockGetDeletionRequestById.mockRejectedValue(new Error("DB error"));

      const res = await getByIdGET(makeGetByIdRequest(), { params: makeParams() });

      expect(res.status).toBe(500);
    });
  });
});

// ─── POST /api/admin/deletion-requests/[id] (execute) ───────────────────────────

describe("POST /api/admin/deletion-requests/[id]", () => {
  describe("A — authentication", () => {
    it("A1: unauthenticated → 401", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await executeByIdPOST(makeExecuteRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("B — authorization", () => {
    it("B1: non-admin → 403", async () => {
      mockUserRoleSingle.mockResolvedValue({ data: { role: "user" }, error: null });

      const res = await executeByIdPOST(makeExecuteRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(403);
    });
  });

  describe("C — happy path", () => {
    it("C1: pending request with no paid orders → completes deletion", async () => {
      const res = await executeByIdPOST(makeExecuteRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.status).toBe("completed");
    });

    it("C2: sends completion email when status is completed", async () => {
      const res = await executeByIdPOST(makeExecuteRequest(), {
        params: makeParams(),
      });
      await res.json();

      expect(mockSendDeletionCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ email: GUEST_EMAIL })
      );
    });

    it("C3: deferred_legal result - email is NOT sent", async () => {
      mockExecuteDeletionRequest.mockResolvedValue({
        success: true,
        status: "deferred_legal",
        message: "Deferred due to paid orders",
        ordersDeleted: 0,
        otpCleared: true,
        hasPaidOrders: true,
        paidOrdersCount: 2,
        retentionEndDate: new Date("2034-01-01"),
      });

      const res = await executeByIdPOST(makeExecuteRequest(), {
        params: makeParams(),
      });
      await res.json();

      expect(mockSendDeletionCompleted).not.toHaveBeenCalled();
    });

    it("C4: returns retention end date when deferred", async () => {
      const retentionDate = new Date("2034-01-01");
      mockExecuteDeletionRequest.mockResolvedValue({
        success: true,
        status: "deferred_legal",
        message: "Deferred",
        ordersDeleted: 0,
        otpCleared: true,
        hasPaidOrders: true,
        paidOrdersCount: 1,
        retentionEndDate: retentionDate,
      });

      const res = await executeByIdPOST(makeExecuteRequest(), {
        params: makeParams(),
      });
      const body = await res.json();

      expect(body.details.retentionEndDate).toBe("2034-01-01");
    });

    it("C5: logs security event after execution", async () => {
      await executeByIdPOST(makeExecuteRequest(), { params: makeParams() });

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        "admin_executed_deletion_request",
        expect.objectContaining({
          requestId: REQUEST_ID_1,
          adminId: ADMIN_USER_ID,
        })
      );
    });
  });

  describe("E — invalid state", () => {
    it("E1: deletion request not found → 404", async () => {
      mockGetDeletionRequestById.mockResolvedValue(null);

      const res = await executeByIdPOST(makeExecuteRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(404);
    });

    it("E2: request with status 'completed' cannot be re-executed → 400", async () => {
      mockGetDeletionRequestById.mockResolvedValue({
        ...sampleRequest,
        status: "completed",
      });

      const res = await executeByIdPOST(makeExecuteRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/cannot execute/i);
    });

    it("E3: request with status 'deferred_legal' cannot be re-executed → 400", async () => {
      mockGetDeletionRequestById.mockResolvedValue({
        ...sampleRequest,
        status: "deferred_legal",
      });

      const res = await executeByIdPOST(makeExecuteRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("F — error handling", () => {
    it("F1: executeDeletionRequest throws → 500", async () => {
      mockExecuteDeletionRequest.mockRejectedValue(new Error("DB error"));

      const res = await executeByIdPOST(makeExecuteRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(500);
    });
  });
});

// ─── POST /api/admin/deletion-requests/bulk-execute ─────────────────────────────

describe("POST /api/admin/deletion-requests/bulk-execute", () => {
  describe("A — authentication", () => {
    it("A1: unauthenticated → 401", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await bulkExecutePOST(
        makeBulkRequest({ requestIds: [REQUEST_ID_1] })
      );

      expect(res.status).toBe(401);
    });
  });

  describe("B — authorization", () => {
    it("B1: non-admin → 403", async () => {
      mockUserRoleSingle.mockResolvedValue({ data: { role: "user" }, error: null });

      const res = await bulkExecutePOST(
        makeBulkRequest({ requestIds: [REQUEST_ID_1] })
      );

      expect(res.status).toBe(403);
    });
  });

  describe("C — happy path", () => {
    it("C1: processes multiple requests and returns summary", async () => {
      mockGetDeletionRequestById
        .mockResolvedValueOnce({ ...sampleRequest, id: REQUEST_ID_1 })
        .mockResolvedValueOnce({ ...sampleRequest, id: REQUEST_ID_2 });

      const res = await bulkExecutePOST(
        makeBulkRequest({ requestIds: [REQUEST_ID_1, REQUEST_ID_2] })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.summary.total).toBe(2);
      expect(body.results).toHaveLength(2);
    });

    it("C2: sends deletion email for completed requests only", async () => {
      mockGetDeletionRequestById.mockResolvedValue({
        ...sampleRequest,
        id: REQUEST_ID_1,
      });

      await bulkExecutePOST(makeBulkRequest({ requestIds: [REQUEST_ID_1] }));

      expect(mockSendDeletionCompleted).toHaveBeenCalledTimes(1);
    });

    it("C3: logs security event with correct count", async () => {
      await bulkExecutePOST(
        makeBulkRequest({ requestIds: [REQUEST_ID_1] })
      );

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        "admin_bulk_executed_deletion_requests",
        expect.objectContaining({
          adminId: ADMIN_USER_ID,
          requestCount: 1,
        })
      );
    });

    it("C4: request not found is included in results as failure", async () => {
      mockGetDeletionRequestById.mockResolvedValueOnce(null);

      const res = await bulkExecutePOST(
        makeBulkRequest({ requestIds: [REQUEST_ID_1] })
      );
      const body = await res.json();

      const notFoundResult = body.results.find(
        (r: { id: string; status: string }) => r.id === REQUEST_ID_1
      );
      expect(notFoundResult.status).toBe("not_found");
    });

    it("C5: request with completed status is skipped", async () => {
      mockGetDeletionRequestById.mockResolvedValue({
        ...sampleRequest,
        status: "completed",
      });

      const res = await bulkExecutePOST(
        makeBulkRequest({ requestIds: [REQUEST_ID_1] })
      );
      const body = await res.json();

      const result = body.results[0];
      expect(result.success).toBe(false);
    });
  });

  describe("D — input validation", () => {
    it("D1: missing requestIds → 400", async () => {
      const res = await bulkExecutePOST(makeBulkRequest({}));

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/requestids array is required/i);
    });

    it("D2: empty requestIds array → 400", async () => {
      const res = await bulkExecutePOST(makeBulkRequest({ requestIds: [] }));

      expect(res.status).toBe(400);
    });

    it("D3: more than 50 requestIds → 400", async () => {
      const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`);

      const res = await bulkExecutePOST(makeBulkRequest({ requestIds: ids }));

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/maximum 50/i);
    });

    it("D4: exactly 50 requestIds → not rejected by limit validation", async () => {
      const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`);
      // Each will be "not_found" but the request itself is valid
      mockGetDeletionRequestById.mockResolvedValue(null);

      const res = await bulkExecutePOST(makeBulkRequest({ requestIds: ids }));

      // Should not be rejected for count reasons
      expect(res.status).toBe(200);
    });
  });

  describe("F — error handling", () => {
    it("F1: top-level throws → 500", async () => {
      // Force top-level error (e.g., can't parse auth)
      mockGetUser.mockRejectedValue(new Error("Session error"));
      // handleAuthError not used here, so error bubbles to catch
      const res = await bulkExecutePOST(
        makeBulkRequest({ requestIds: [REQUEST_ID_1] })
      );

      expect(res.status).toBe(500);
    });
  });
});