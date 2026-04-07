/**
 * tests/admin-grievances.test.ts
 *
 * Unit tests for:
 *   app/api/admin/grievances/route.ts         (GET - list)
 *   app/api/admin/grievances/[id]/route.ts    (GET - single, PATCH - update)
 *
 * Covers:
 *   A — Authentication (unauthenticated)
 *   B — Authorization (non-admin)
 *   C — Happy path / business logic
 *   D — Input validation (PATCH)
 *   E — Not found
 *   F — CSRF protection (PATCH only)
 *   G — Email notifications
 *   H — Error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockGetUser,
  mockUserRoleSingle,
  mockGetGrievances,
  mockGetGrievanceStats,
  mockGetGrievanceById,
  mockUpdateGrievance,
  mockRequireCsrf,
  mockSanitizeObject,
  mockSendGrievanceStatusUpdate,
  mockSendGrievanceResolved,
  mockLogError,
  mockGetFirstZodError,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUserRoleSingle: vi.fn(),
  mockGetGrievances: vi.fn(),
  mockGetGrievanceStats: vi.fn(),
  mockGetGrievanceById: vi.fn(),
  mockUpdateGrievance: vi.fn(),
  mockRequireCsrf: vi.fn(),
  mockSanitizeObject: vi.fn((o: unknown) => o),
  mockSendGrievanceStatusUpdate: vi.fn(),
  mockSendGrievanceResolved: vi.fn(),
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

vi.mock("@/lib/grievance", () => ({
  getGrievances: mockGetGrievances,
  getGrievanceStats: mockGetGrievanceStats,
  getGrievanceById: mockGetGrievanceById,
  updateGrievance: mockUpdateGrievance,
  GrievanceStatus: {},
  GrievanceCategory: {},
}));

vi.mock("@/lib/csrf", () => ({
  requireCsrf: mockRequireCsrf,
}));

vi.mock("@/lib/xss", () => ({
  sanitizeObject: mockSanitizeObject,
}));

vi.mock("@/lib/email", () => ({
  sendGrievanceStatusUpdate: mockSendGrievanceStatusUpdate,
  sendGrievanceResolved: mockSendGrievanceResolved,
}));

vi.mock("@/lib/logger", () => ({
  logError: mockLogError,
}));

vi.mock("@/lib/errors", () => ({
  getFirstZodError: mockGetFirstZodError,
}));

// ─── Import handlers after mocks ────────────────────────────────────────────────

import { GET as listGET } from "@/app/api/admin/grievances/route";
import {
  GET as getByIdGET,
  PATCH as updatePATCH,
} from "@/app/api/admin/grievances/[id]/route";

// ─── Constants ──────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = "admin-uuid-gggg";
const GRIEVANCE_ID = "grievance-uuid-1111";
const CUSTOMER_EMAIL = "customer@example.com";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeListRequest(params?: Record<string, string>): Request {
  const url = new URL("http://localhost/api/admin/grievances");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" });
}

function makeGetByIdRequest(): Request {
  return new Request(`http://localhost/api/admin/grievances/${GRIEVANCE_ID}`, {
    method: "GET",
  });
}

function makePatchRequest(body: object): Request {
  return new Request(`http://localhost/api/admin/grievances/${GRIEVANCE_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id = GRIEVANCE_ID): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

function mockAdminUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN_USER_ID } } });
  mockUserRoleSingle.mockResolvedValue({ data: { role: "admin" }, error: null });
}

const sampleGrievance = {
  id: GRIEVANCE_ID,
  email: CUSTOMER_EMAIL,
  subject: "Data not deleted",
  description: "I requested deletion but data still visible",
  category: "deletion",
  status: "open",
  priority: "medium",
  admin_notes: null,
  resolution_notes: null,
  sla_deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  resolved_at: null,
  resolved_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const sampleStats = {
  open: 3,
  in_progress: 1,
  resolved: 5,
  closed: 2,
};

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  mockAdminUser();
  mockRequireCsrf.mockResolvedValue({ valid: true });

  mockGetGrievances.mockResolvedValue({
    grievances: [sampleGrievance],
    total: 1,
  });
  mockGetGrievanceStats.mockResolvedValue(sampleStats);
  mockGetGrievanceById.mockResolvedValue(sampleGrievance);
  mockUpdateGrievance.mockResolvedValue({
    success: true,
    message: "Grievance updated",
  });
  mockSanitizeObject.mockImplementation((o: unknown) => o);
  mockSendGrievanceStatusUpdate.mockResolvedValue(undefined);
  mockSendGrievanceResolved.mockResolvedValue(undefined);
});

// ─── GET /api/admin/grievances ──────────────────────────────────────────────────

describe("GET /api/admin/grievances", () => {
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
    it("C1: returns grievances, total, stats", async () => {
      const res = await listGET(makeListRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.grievances).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.stats).toBeDefined();
    });

    it("C2: passes status filter to getGrievances", async () => {
      await listGET(makeListRequest({ status: "open" }));

      expect(mockGetGrievances).toHaveBeenCalledWith(
        expect.objectContaining({ status: "open" })
      );
    });

    it("C3: passes email filter to getGrievances", async () => {
      await listGET(makeListRequest({ email: "user@test.com" }));

      expect(mockGetGrievances).toHaveBeenCalledWith(
        expect.objectContaining({ email: "user@test.com" })
      );
    });

    it("C4: passes category filter to getGrievances", async () => {
      await listGET(makeListRequest({ category: "deletion" }));

      expect(mockGetGrievances).toHaveBeenCalledWith(
        expect.objectContaining({ category: "deletion" })
      );
    });

    it("C5: uses default pagination", async () => {
      await listGET(makeListRequest());

      expect(mockGetGrievances).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20, offset: 0 })
      );
    });

    it("C6: calls getGrievances and getGrievanceStats in parallel", async () => {
      await listGET(makeListRequest());

      expect(mockGetGrievances).toHaveBeenCalledTimes(1);
      expect(mockGetGrievanceStats).toHaveBeenCalledTimes(1);
    });
  });

  describe("H — error handling", () => {
    it("H1: getGrievances throws → 500", async () => {
      mockGetGrievances.mockRejectedValue(new Error("DB error"));

      const res = await listGET(makeListRequest());

      expect(res.status).toBe(500);
    });

    it("H2: getGrievanceStats throws → 500", async () => {
      mockGetGrievanceStats.mockRejectedValue(new Error("Stats error"));

      const res = await listGET(makeListRequest());

      expect(res.status).toBe(500);
    });
  });
});

// ─── GET /api/admin/grievances/[id] ─────────────────────────────────────────────

describe("GET /api/admin/grievances/[id]", () => {
  describe("A — authentication", () => {
    it("A1: unauthenticated → 401", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await getByIdGET(makeGetByIdRequest(), {
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

      const res = await getByIdGET(makeGetByIdRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(403);
    });
  });

  describe("C — happy path", () => {
    it("C1: returns grievance details", async () => {
      const res = await getByIdGET(makeGetByIdRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.grievance.id).toBe(GRIEVANCE_ID);
    });
  });

  describe("E — not found", () => {
    it("E1: grievance not found → 404", async () => {
      mockGetGrievanceById.mockResolvedValue(null);

      const res = await getByIdGET(makeGetByIdRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatch(/not found/i);
    });
  });

  describe("H — error handling", () => {
    it("H1: getGrievanceById throws → 500", async () => {
      mockGetGrievanceById.mockRejectedValue(new Error("DB error"));

      const res = await getByIdGET(makeGetByIdRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(500);
    });
  });
});

// ─── PATCH /api/admin/grievances/[id] ───────────────────────────────────────────

describe("PATCH /api/admin/grievances/[id]", () => {
  describe("A — authentication", () => {
    it("A1: unauthenticated → 401", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await updatePATCH(makePatchRequest({ status: "in_progress" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("B — authorization", () => {
    it("B1: non-admin → 403", async () => {
      mockUserRoleSingle.mockResolvedValue({
        data: { role: "user" },
        error: null,
      });

      const res = await updatePATCH(makePatchRequest({ status: "in_progress" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(403);
    });
  });

  describe("C — happy path", () => {
    it("C1: update status → 200", async () => {
      const res = await updatePATCH(makePatchRequest({ status: "in_progress" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("C2: calls updateGrievance with correct params", async () => {
      await updatePATCH(
        makePatchRequest({ status: "in_progress", adminNotes: "Looking into it" }),
        { params: makeParams() }
      );

      expect(mockUpdateGrievance).toHaveBeenCalledWith(
        expect.objectContaining({
          grievanceId: GRIEVANCE_ID,
          status: "in_progress",
          adminNotes: "Looking into it",
          adminId: ADMIN_USER_ID,
        })
      );
    });

    it("C3: update priority → 200", async () => {
      const res = await updatePATCH(makePatchRequest({ priority: "high" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(200);
    });
  });

  describe("D — input validation", () => {
    it("D1: invalid status value → 400", async () => {
      const res = await updatePATCH(
        makePatchRequest({ status: "invalid-status" }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
    });

    it("D2: invalid priority value → 400", async () => {
      const res = await updatePATCH(
        makePatchRequest({ priority: "super-high" }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
    });
  });

  describe("E — not found / business logic failure", () => {
    it("E1: grievance not found → 404", async () => {
      mockGetGrievanceById.mockResolvedValue(null);

      const res = await updatePATCH(makePatchRequest({ status: "in_progress" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(404);
    });

    it("E2: updateGrievance returns failure → 400", async () => {
      mockUpdateGrievance.mockResolvedValue({
        success: false,
        message: "Cannot update closed grievance",
      });

      const res = await updatePATCH(makePatchRequest({ status: "in_progress" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/cannot update closed/i);
    });
  });

  describe("F — CSRF protection", () => {
    it("F1: missing CSRF token → 403", async () => {
      mockRequireCsrf.mockResolvedValue({
        valid: false,
        error: "CSRF token missing",
      });

      const res = await updatePATCH(makePatchRequest({ status: "in_progress" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("CSRF token missing");
    });
  });

  describe("G — email notifications", () => {
    it("G1: status change to 'resolved' with resolutionNotes → sends resolved email", async () => {
      const res = await updatePATCH(
        makePatchRequest({
          status: "resolved",
          resolutionNotes: "Issue resolved by deleting data",
        }),
        { params: makeParams() }
      );
      await res.json();

      // Email is sent non-blocking via .catch(), check it was called
      // Wait a tick for the promise to be fired
      await Promise.resolve();
      expect(mockSendGrievanceResolved).toHaveBeenCalledWith(
        expect.objectContaining({
          email: CUSTOMER_EMAIL,
          grievanceId: GRIEVANCE_ID,
          resolutionNotes: "Issue resolved by deleting data",
        })
      );
    });

    it("G2: status change to non-resolved → sends status update email", async () => {
      const res = await updatePATCH(
        makePatchRequest({ status: "in_progress" }),
        { params: makeParams() }
      );
      await res.json();

      await Promise.resolve();
      expect(mockSendGrievanceStatusUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          email: CUSTOMER_EMAIL,
          grievanceId: GRIEVANCE_ID,
          newStatus: "in_progress",
        })
      );
    });

    it("G3: same status as current → no status update email sent", async () => {
      // sampleGrievance.status is 'open', updating to 'open' → no change
      const res = await updatePATCH(makePatchRequest({ status: "open" }), {
        params: makeParams(),
      });
      await res.json();

      await Promise.resolve();
      expect(mockSendGrievanceStatusUpdate).not.toHaveBeenCalled();
    });

    it("G4: only adminNotes change (no status) → no email sent", async () => {
      const res = await updatePATCH(
        makePatchRequest({ adminNotes: "Investigating..." }),
        { params: makeParams() }
      );
      await res.json();

      await Promise.resolve();
      expect(mockSendGrievanceStatusUpdate).not.toHaveBeenCalled();
      expect(mockSendGrievanceResolved).not.toHaveBeenCalled();
    });
  });

  describe("H — error handling", () => {
    it("H1: updateGrievance throws → 500", async () => {
      mockUpdateGrievance.mockRejectedValue(new Error("DB error"));

      const res = await updatePATCH(makePatchRequest({ status: "in_progress" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(500);
    });

    it("H2: logError called on unexpected error", async () => {
      mockUpdateGrievance.mockRejectedValue(new Error("Unexpected"));

      await updatePATCH(makePatchRequest({ status: "in_progress" }), {
        params: makeParams(),
      });

      expect(mockLogError).toHaveBeenCalled();
    });
  });
});