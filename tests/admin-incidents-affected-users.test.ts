/**
 * tests/admin-incidents-affected-users.test.ts
 *
 * Unit tests for:
 *   app/api/admin/incidents/[id]/affected-users/route.ts        (GET, POST)
 *   app/api/admin/incidents/[id]/affected-users/notify/route.ts (POST)
 *
 * Covers:
 *   A — Authentication (unauthenticated)
 *   B — Authorization (non-admin)
 *   C — Happy path / business logic
 *   D — Input validation
 *   E — Not found
 *   F — Error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockGetUser,
  mockUserRoleSingle,
  mockIncidentSingle,
  mockGetAffectedUsers,
  mockGetAffectedUsersSummary,
  mockIdentifyAffectedUsers,
  mockAddAffectedUser,
  mockNotifyAllAffectedUsers,
  mockNotifyAffectedUser,
  mockGetVendorDataTypes,
  mockLogError,
  mockLogSecurityEvent,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUserRoleSingle: vi.fn(),
  mockIncidentSingle: vi.fn(),
  mockGetAffectedUsers: vi.fn(),
  mockGetAffectedUsersSummary: vi.fn(),
  mockIdentifyAffectedUsers: vi.fn(),
  mockAddAffectedUser: vi.fn(),
  mockNotifyAllAffectedUsers: vi.fn(),
  mockNotifyAffectedUser: vi.fn(),
  mockGetVendorDataTypes: vi.fn(),
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
      if (table === "security_incidents") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: mockIncidentSingle,
            }),
          }),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    },
  })),
}));

vi.mock("@/lib/incident-affected-users", () => ({
  getAffectedUsers: mockGetAffectedUsers,
  getAffectedUsersSummary: mockGetAffectedUsersSummary,
  identifyAffectedUsers: mockIdentifyAffectedUsers,
  addAffectedUser: mockAddAffectedUser,
  notifyAllAffectedUsers: mockNotifyAllAffectedUsers,
  notifyAffectedUser: mockNotifyAffectedUser,
  getVendorDataTypes: mockGetVendorDataTypes,
}));

vi.mock("@/lib/logger", () => ({
  logError: mockLogError,
  logSecurityEvent: mockLogSecurityEvent,
}));

// ─── Import handlers after mocks ────────────────────────────────────────────────

import {
  GET as affectedUsersGET,
  POST as affectedUsersPOST,
} from "@/app/api/admin/incidents/[id]/affected-users/route";

import {
  POST as notifyPOST,
} from "@/app/api/admin/incidents/[id]/affected-users/notify/route";

// ─── Constants ──────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = "admin-uuid-iiii";
const INCIDENT_ID = "incident-uuid-1111";
const AFFECTED_USER_ID = "affected-uuid-2222";
const CUSTOMER_EMAIL = "victim@example.com";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeGetRequest(params?: Record<string, string>): Request {
  const url = new URL(
    `http://localhost/api/admin/incidents/${INCIDENT_ID}/affected-users`
  );
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" });
}

function makePostRequest(body: object): Request {
  return new Request(
    `http://localhost/api/admin/incidents/${INCIDENT_ID}/affected-users`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function makeNotifyRequest(body: object): Request {
  return new Request(
    `http://localhost/api/admin/incidents/${INCIDENT_ID}/affected-users/notify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function makeParams(id = INCIDENT_ID): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

function mockAdminUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN_USER_ID } } });
  mockUserRoleSingle.mockResolvedValue({ data: { role: "admin" }, error: null });
}

const sampleIncident = {
  id: INCIDENT_ID,
  incident_type: "vendor_breach",
  description: "Razorpay data exposed",
  created_at: new Date().toISOString(),
  severity: "critical",
  status: "open",
};

const sampleAffectedUser = {
  id: AFFECTED_USER_ID,
  incident_id: INCIDENT_ID,
  email: CUSTOMER_EMAIL,
  phone: "9876543210",
  order_id: null,
  affected_data_types: ["email", "phone"],
  notification_status: "pending",
  notified_at: null,
};

const sampleSummary = {
  total: 10,
  pending: 8,
  notified: 2,
  failed: 0,
};

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  mockAdminUser();
  mockIncidentSingle.mockResolvedValue({ data: sampleIncident, error: null });
  mockGetAffectedUsers.mockResolvedValue({
    users: [sampleAffectedUser],
    total: 1,
  });
  mockGetAffectedUsersSummary.mockResolvedValue(sampleSummary);
  mockIdentifyAffectedUsers.mockResolvedValue({
    success: true,
    message: "Identified 10 users",
    usersIdentified: 10,
    usersAdded: 10,
    alreadyTracked: 0,
  });
  mockAddAffectedUser.mockResolvedValue({
    success: true,
    id: AFFECTED_USER_ID,
  });
  mockNotifyAllAffectedUsers.mockResolvedValue({
    success: true,
    sent: 8,
    failed: 0,
    skipped: 2,
  });
  mockNotifyAffectedUser.mockResolvedValue({ success: true });
  mockGetVendorDataTypes.mockReturnValue(["email", "phone", "payment_info"]);
});

// ─── GET /api/admin/incidents/[id]/affected-users ───────────────────────────────

describe("GET /api/admin/incidents/[id]/affected-users", () => {
  describe("A — authentication", () => {
    it("A1: unauthenticated → 401", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await affectedUsersGET(makeGetRequest(), {
        params: makeParams(),
      });

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

      const res = await affectedUsersGET(makeGetRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(403);
    });

    it("B2: super_admin is allowed", async () => {
      mockUserRoleSingle.mockResolvedValue({
        data: { role: "super_admin" },
        error: null,
      });

      const res = await affectedUsersGET(makeGetRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(200);
    });
  });

  describe("C — happy path", () => {
    it("C1: returns users, total, summary", async () => {
      const res = await affectedUsersGET(makeGetRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.incidentId).toBe(INCIDENT_ID);
      expect(body.users).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.summary).toBeDefined();
    });

    it("C2: passes status filter to getAffectedUsers", async () => {
      await affectedUsersGET(makeGetRequest({ status: "pending" }), {
        params: makeParams(),
      });

      expect(mockGetAffectedUsers).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pending" })
      );
    });

    it("C3: uses default pagination (limit=50, offset=0)", async () => {
      await affectedUsersGET(makeGetRequest(), { params: makeParams() });

      expect(mockGetAffectedUsers).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50, offset: 0 })
      );
    });

    it("C4: respects custom limit and offset", async () => {
      await affectedUsersGET(
        makeGetRequest({ limit: "100", offset: "50" }),
        { params: makeParams() }
      );

      expect(mockGetAffectedUsers).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100, offset: 50 })
      );
    });
  });

  describe("E — not found", () => {
    it("E1: incident not found → 404", async () => {
      mockIncidentSingle.mockResolvedValue({ data: null, error: null });

      const res = await affectedUsersGET(makeGetRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatch(/incident not found/i);
    });
  });

  describe("F — error handling", () => {
    it("F1: getAffectedUsers throws → 500", async () => {
      mockGetAffectedUsers.mockRejectedValue(new Error("DB error"));

      const res = await affectedUsersGET(makeGetRequest(), {
        params: makeParams(),
      });

      expect(res.status).toBe(500);
    });
  });
});

// ─── POST /api/admin/incidents/[id]/affected-users (identify/add) ────────────────

describe("POST /api/admin/incidents/[id]/affected-users", () => {
  describe("A — authentication", () => {
    it("A1: unauthenticated → 401", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await affectedUsersPOST(
        makePostRequest({ action: "identify", vendorType: "razorpay" }),
        { params: makeParams() }
      );

      expect(res.status).toBe(401);
    });
  });

  describe("B — authorization", () => {
    it("B1: non-admin → 403", async () => {
      mockUserRoleSingle.mockResolvedValue({
        data: { role: "viewer" },
        error: null,
      });

      const res = await affectedUsersPOST(
        makePostRequest({ action: "identify", vendorType: "razorpay" }),
        { params: makeParams() }
      );

      expect(res.status).toBe(403);
    });
  });

  describe("C — identify action", () => {
    it("C1: identify razorpay breach → returns identified users count", async () => {
      const res = await affectedUsersPOST(
        makePostRequest({
          action: "identify",
          vendorType: "razorpay",
          breachStartDate: "2026-01-01",
          breachEndDate: "2026-01-15",
        }),
        { params: makeParams() }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.usersIdentified).toBe(10);
    });

    it("C2: calls identifyAffectedUsers with correct params", async () => {
      await affectedUsersPOST(
        makePostRequest({
          action: "identify",
          vendorType: "shiprocket",
          breachStartDate: "2026-01-01",
          breachEndDate: "2026-01-15",
          affectedDataTypes: ["email", "address"],
        }),
        { params: makeParams() }
      );

      expect(mockIdentifyAffectedUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          incidentId: INCIDENT_ID,
          vendorType: "shiprocket",
          affectedDataTypes: ["email", "address"],
        })
      );
    });

    it("C3: uses default data types from getVendorDataTypes when not specified", async () => {
      await affectedUsersPOST(
        makePostRequest({
          action: "identify",
          vendorType: "razorpay",
          breachStartDate: "2026-01-01",
          breachEndDate: "2026-01-15",
        }),
        { params: makeParams() }
      );

      expect(mockGetVendorDataTypes).toHaveBeenCalledWith("razorpay");
    });

    it("C4: logs security event after identification", async () => {
      await affectedUsersPOST(
        makePostRequest({
          action: "identify",
          vendorType: "razorpay",
          breachStartDate: "2026-01-01",
          breachEndDate: "2026-01-15",
        }),
        { params: makeParams() }
      );

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        "admin_identified_affected_users",
        expect.objectContaining({
          adminId: ADMIN_USER_ID,
          incidentId: INCIDENT_ID,
        })
      );
    });
  });

  describe("D — identify action validation", () => {
    it("D1: invalid vendorType → 400", async () => {
      const res = await affectedUsersPOST(
        makePostRequest({
          action: "identify",
          vendorType: "unknown-vendor",
          breachStartDate: "2026-01-01",
          breachEndDate: "2026-01-15",
        }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/vendortype must be/i);
    });

    it("D2: missing breachStartDate → 400", async () => {
      const res = await affectedUsersPOST(
        makePostRequest({
          action: "identify",
          vendorType: "razorpay",
          breachEndDate: "2026-01-15",
        }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/breachworldstart|breachstartdate|required/i);
    });

    it("D3: missing breachEndDate → 400", async () => {
      const res = await affectedUsersPOST(
        makePostRequest({
          action: "identify",
          vendorType: "razorpay",
          breachStartDate: "2026-01-01",
        }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
    });

    it("D4: invalid date format → 400", async () => {
      const res = await affectedUsersPOST(
        makePostRequest({
          action: "identify",
          vendorType: "razorpay",
          breachStartDate: "not-a-date",
          breachEndDate: "also-not-a-date",
        }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/invalid date format/i);
    });

    it("D5: startDate after endDate → 400", async () => {
      const res = await affectedUsersPOST(
        makePostRequest({
          action: "identify",
          vendorType: "razorpay",
          breachStartDate: "2026-01-15",
          breachEndDate: "2026-01-01",
        }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/must be before/i);
    });
  });

  describe("C — add action", () => {
    it("C5: manually add user → returns id", async () => {
      const res = await affectedUsersPOST(
        makePostRequest({
          action: "add",
          email: CUSTOMER_EMAIL,
          affectedDataTypes: ["email", "phone"],
        }),
        { params: makeParams() }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBe(AFFECTED_USER_ID);
    });

    it("C6: calls addAffectedUser with correct params", async () => {
      await affectedUsersPOST(
        makePostRequest({
          action: "add",
          email: CUSTOMER_EMAIL,
          phone: "9876543210",
          affectedDataTypes: ["email"],
        }),
        { params: makeParams() }
      );

      expect(mockAddAffectedUser).toHaveBeenCalledWith(
        expect.objectContaining({
          incidentId: INCIDENT_ID,
          email: CUSTOMER_EMAIL,
          phone: "9876543210",
          affectedDataTypes: ["email"],
        })
      );
    });

    it("C7: logs security event after adding user", async () => {
      await affectedUsersPOST(
        makePostRequest({
          action: "add",
          email: CUSTOMER_EMAIL,
          affectedDataTypes: ["email"],
        }),
        { params: makeParams() }
      );

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        "admin_added_affected_user",
        expect.objectContaining({
          adminId: ADMIN_USER_ID,
          incidentId: INCIDENT_ID,
          email: CUSTOMER_EMAIL,
        })
      );
    });
  });

  describe("D — add action validation", () => {
    it("D6: missing email in add action → 400", async () => {
      const res = await affectedUsersPOST(
        makePostRequest({
          action: "add",
          affectedDataTypes: ["email"],
        }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/email is required/i);
    });

    it("D7: missing affectedDataTypes in add action → 400", async () => {
      const res = await affectedUsersPOST(
        makePostRequest({
          action: "add",
          email: CUSTOMER_EMAIL,
        }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/affecteddatatypes/i);
    });

    it("D8: empty affectedDataTypes array → 400", async () => {
      const res = await affectedUsersPOST(
        makePostRequest({
          action: "add",
          email: CUSTOMER_EMAIL,
          affectedDataTypes: [],
        }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
    });
  });

  describe("D — invalid action", () => {
    it("D9: unknown action → 400", async () => {
      const res = await affectedUsersPOST(
        makePostRequest({ action: "delete" }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/action must be/i);
    });
  });

  describe("E — not found", () => {
    it("E1: incident not found → 404", async () => {
      mockIncidentSingle.mockResolvedValue({ data: null, error: null });

      const res = await affectedUsersPOST(
        makePostRequest({ action: "add", email: CUSTOMER_EMAIL, affectedDataTypes: ["email"] }),
        { params: makeParams() }
      );

      expect(res.status).toBe(404);
    });
  });

  describe("F — error handling", () => {
    it("F1: addAffectedUser failure → 400 with error", async () => {
      mockAddAffectedUser.mockResolvedValue({
        success: false,
        error: "User already tracked",
      });

      const res = await affectedUsersPOST(
        makePostRequest({
          action: "add",
          email: CUSTOMER_EMAIL,
          affectedDataTypes: ["email"],
        }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/already tracked/i);
    });
  });
});

// ─── POST /api/admin/incidents/[id]/affected-users/notify ────────────────────────

describe("POST /api/admin/incidents/[id]/affected-users/notify", () => {
  describe("A — authentication", () => {
    it("A1: unauthenticated → 401", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await notifyPOST(makeNotifyRequest({ action: "notify_all" }), {
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

      const res = await notifyPOST(makeNotifyRequest({ action: "notify_all" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(403);
    });
  });

  describe("C — notify_all action", () => {
    it("C1: notify_all → returns sent/failed/skipped counts", async () => {
      const res = await notifyPOST(makeNotifyRequest({ action: "notify_all" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.sent).toBe(8);
      expect(body.failed).toBe(0);
      expect(body.skipped).toBe(2);
      expect(body.summary).toBeDefined();
    });

    it("C2: calls notifyAllAffectedUsers with correct incidentId and details", async () => {
      await notifyPOST(makeNotifyRequest({ action: "notify_all" }), {
        params: makeParams(),
      });

      expect(mockNotifyAllAffectedUsers).toHaveBeenCalledWith(
        expect.objectContaining({ incidentId: INCIDENT_ID })
      );
    });

    it("C3: passes incident description to notification", async () => {
      await notifyPOST(makeNotifyRequest({ action: "notify_all" }), {
        params: makeParams(),
      });

      const callArg = mockNotifyAllAffectedUsers.mock.calls[0][0];
      expect(callArg.incidentDetails.type).toBe(sampleIncident.incident_type);
    });

    it("C4: logs security event after notify_all", async () => {
      await notifyPOST(makeNotifyRequest({ action: "notify_all" }), {
        params: makeParams(),
      });

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        "admin_notified_all_affected_users",
        expect.objectContaining({
          adminId: ADMIN_USER_ID,
          incidentId: INCIDENT_ID,
          sent: 8,
        })
      );
    });

    it("C5: fetches updated summary after notify_all", async () => {
      await notifyPOST(makeNotifyRequest({ action: "notify_all" }), {
        params: makeParams(),
      });

      expect(mockGetAffectedUsersSummary).toHaveBeenCalledWith(INCIDENT_ID);
    });
  });

  describe("C — notify_single action", () => {
    it("C6: notify_single → 200 success message", async () => {
      const res = await notifyPOST(
        makeNotifyRequest({
          action: "notify_single",
          affectedUserId: AFFECTED_USER_ID,
        }),
        { params: makeParams() }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toMatch(/notification sent/i);
    });

    it("C7: calls notifyAffectedUser with correct params", async () => {
      await notifyPOST(
        makeNotifyRequest({
          action: "notify_single",
          affectedUserId: AFFECTED_USER_ID,
        }),
        { params: makeParams() }
      );

      expect(mockNotifyAffectedUser).toHaveBeenCalledWith(
        expect.objectContaining({ affectedUserId: AFFECTED_USER_ID })
      );
    });

    it("C8: logs security event for single notification", async () => {
      await notifyPOST(
        makeNotifyRequest({
          action: "notify_single",
          affectedUserId: AFFECTED_USER_ID,
        }),
        { params: makeParams() }
      );

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        "admin_notified_single_affected_user",
        expect.objectContaining({
          adminId: ADMIN_USER_ID,
          incidentId: INCIDENT_ID,
          affectedUserId: AFFECTED_USER_ID,
        })
      );
    });
  });

  describe("D — input validation", () => {
    it("D1: invalid action → 400", async () => {
      const res = await notifyPOST(
        makeNotifyRequest({ action: "send_all" }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/action must be/i);
    });

    it("D2: notify_single without affectedUserId → 400", async () => {
      const res = await notifyPOST(
        makeNotifyRequest({ action: "notify_single" }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/affecteduserid is required/i);
    });
  });

  describe("E — not found", () => {
    it("E1: incident not found → 404", async () => {
      mockIncidentSingle.mockResolvedValue({ data: null, error: null });

      const res = await notifyPOST(makeNotifyRequest({ action: "notify_all" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatch(/incident not found/i);
    });
  });

  describe("F — error handling", () => {
    it("F1: notifyAffectedUser failure → 400 with error", async () => {
      mockNotifyAffectedUser.mockResolvedValue({
        success: false,
        error: "User not found",
      });

      const res = await notifyPOST(
        makeNotifyRequest({
          action: "notify_single",
          affectedUserId: AFFECTED_USER_ID,
        }),
        { params: makeParams() }
      );

      expect(res.status).toBe(400);
    });

    it("F2: notifyAllAffectedUsers throws → 500", async () => {
      mockNotifyAllAffectedUsers.mockRejectedValue(new Error("Email service down"));

      const res = await notifyPOST(makeNotifyRequest({ action: "notify_all" }), {
        params: makeParams(),
      });

      expect(res.status).toBe(500);
    });

    it("F3: logError called on unexpected error", async () => {
      mockNotifyAllAffectedUsers.mockRejectedValue(new Error("Unexpected"));

      await notifyPOST(makeNotifyRequest({ action: "notify_all" }), {
        params: makeParams(),
      });

      expect(mockLogError).toHaveBeenCalled();
    });

    it("F4: vendor name extraction from incident description for vendor incidents", async () => {
      // Verify the vendorName is extracted when incident type contains "vendor"
      mockIncidentSingle.mockResolvedValue({
        data: {
          ...sampleIncident,
          incident_type: "vendor_breach",
          description: "Razorpay data breach detected",
        },
        error: null,
      });

      await notifyPOST(makeNotifyRequest({ action: "notify_all" }), {
        params: makeParams(),
      });

      const callArg = mockNotifyAllAffectedUsers.mock.calls[0][0];
      // vendorName should be extracted (Razorpay)
      expect(callArg.incidentDetails.vendorName).toBeTruthy();
    });
  });
});