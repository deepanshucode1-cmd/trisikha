/**
 * tests/cancel-retry.test.ts
 *
 * Direct handler import tests for app/api/orders/cancel/retry/route.ts
 * Covers:
 *   A — auth & input guards
 *   B — return pickup retry
 *   C — return refund retry
 *   D — return no matching scenario
 *   E — shiprocket cancel retry
 *   F — cancellation refund eligibility
 *   G — cancellation refund lock + processing
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockOrderSingle,
  mockSelectAfterUpdate,
  mockItemsEq,
  mockPaymentsRefund,
  mockRequireCsrf,
  mockRequireRole,
  mockShiprocketLogin,
  mockCreateReturnOrder,
  mockGetReturnShippingRate,
  mockGenerateCreditNoteNumber,
  mockGenerateCreditNotePDF,
  mockSendCreditNote,
  mockSendRefundInitiated,
  mockHandleApiError,
  mockHandleAuthError,
} = vi.hoisted(() => ({
  mockOrderSingle: vi.fn(),
  mockSelectAfterUpdate: vi.fn(),
  mockItemsEq: vi.fn(),
  mockPaymentsRefund: vi.fn(),
  mockRequireCsrf: vi.fn(),
  mockRequireRole: vi.fn(),
  mockShiprocketLogin: vi.fn(),
  mockCreateReturnOrder: vi.fn(),
  mockGetReturnShippingRate: vi.fn(),
  mockGenerateCreditNoteNumber: vi.fn(),
  mockGenerateCreditNotePDF: vi.fn(),
  mockSendCreditNote: vi.fn(),
  mockSendRefundInitiated: vi.fn(),
  mockHandleApiError: vi.fn(),
  mockHandleAuthError: vi.fn(),
}));

let updateCalls: any[];
let mockFetch: ReturnType<typeof vi.fn>;

// ─── Module mocks ───────────────────────────────────────────────────────────────

vi.mock("@/utils/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({
              single: mockOrderSingle,
            }),
          }),
          update: (payload: any) => {
            updateCalls.push(payload);
            const s: Record<string, any> = {};
            s.eq = vi.fn(() => s);
            s.is = vi.fn(() => s);
            s.or = vi.fn(() => s);
            s.select = mockSelectAfterUpdate;
            return s;
          },
        };
      }
      if (table === "order_items") {
        return { select: () => ({ eq: mockItemsEq }) };
      }
      const noop: any = {};
      noop.select = () => noop;
      noop.eq = () => noop;
      noop.single = vi.fn().mockResolvedValue({ data: null, error: null });
      return noop;
    },
  }),
}));

vi.mock("razorpay", () => ({
  default: vi.fn(function () {
    return { payments: { refund: mockPaymentsRefund } };
  }),
}));

vi.mock("@/lib/csrf", () => ({
  requireCsrf: mockRequireCsrf,
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mockRequireRole,
  handleAuthError: (...args: any[]) => mockHandleAuthError(...args),
}));

vi.mock("@/utils/shiprocket", () => ({
  default: { login: mockShiprocketLogin },
  createReturnOrder: mockCreateReturnOrder,
  getReturnShippingRate: mockGetReturnShippingRate,
}));

vi.mock("@/lib/rate-limit", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/logger", () => ({
  logPayment: vi.fn(),
  logOrder: vi.fn(),
  logAuth: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logDataAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/creditNote", () => ({
  generateCreditNoteNumber: mockGenerateCreditNoteNumber,
  generateCreditNotePDF: mockGenerateCreditNotePDF,
}));

vi.mock("@/lib/email", () => ({
  sendCreditNote: mockSendCreditNote,
  sendRefundInitiated: mockSendRefundInitiated,
}));

vi.mock("@/lib/errors", () => ({
  handleApiError: (...args: any[]) => mockHandleApiError(...args),
}));

// ─── Import handler after mocks ─────────────────────────────────────────────────

import { POST } from "@/app/api/orders/cancel/retry/route";

// ─── Helpers ────────────────────────────────────────────────────────────────────

vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test");
vi.stubEnv("RAZORPAY_KEY_SECRET", "test_secret");
vi.stubEnv("WAREHOUSE_PINCODE", "382721");

const UUID = "123e4567-e89b-12d3-a456-426614174000";

function makeRequest(body: object): Request {
  return new Request("http://localhost/api/orders/cancel/retry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function baseOrder(overrides: Record<string, any> = {}) {
  return {
    id: UUID,
    order_status: "CANCELLATION_REQUESTED",
    cancellation_status: "CANCELLATION_REQUESTED",
    return_status: "NOT_REQUESTED",
    payment_status: "paid",
    refund_status: null,
    total_amount: 1000,
    payment_id: "pay_test123",
    shipping_cost: 50,
    guest_email: "test@example.com",
    guest_phone: "9876543210",
    shipping_pincode: "380001",
    shipping_first_name: "Test",
    shipping_last_name: "User",
    shipping_address_line1: "123 Main St",
    shipping_address_line2: "",
    shipping_city: "Ahmedabad",
    shipping_state: "Gujarat",
    shipping_country: "India",
    shiprocket_order_id: null,
    shiprocket_shipment_id: null,
    shiprocket_status: "NOT_SHIPPED",
    return_refund_amount: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const defaultItems = [
  {
    product_id: "p1",
    product_name: "Organic Manure 5kg",
    sku: "SKU-001",
    quantity: 2,
    unit_price: 475,
    weight: 5,
    length: 30,
    breadth: 20,
    height: 15,
  },
];

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  updateCalls = [];

  // Reset mocks that use mockResolvedValueOnce
  mockOrderSingle.mockReset().mockResolvedValue({ data: baseOrder(), error: null });
  mockSelectAfterUpdate.mockReset().mockResolvedValue({ data: [baseOrder()], error: null });
  mockItemsEq.mockReset().mockResolvedValue({ data: defaultItems, error: null });
  mockPaymentsRefund.mockReset().mockResolvedValue({ id: "rfnd_test", status: "processed", amount: 100000 });

  // Auth defaults
  mockRequireCsrf.mockResolvedValue({ valid: true });
  mockRequireRole.mockResolvedValue({ user: { id: "admin-123" } });

  // Restore implementations
  mockHandleAuthError.mockImplementation(() => {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  });
  mockHandleApiError.mockImplementation(() => {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  });

  mockGenerateCreditNoteNumber.mockResolvedValue("CN-001");
  mockGenerateCreditNotePDF.mockResolvedValue(Buffer.from("pdf"));
  mockSendCreditNote.mockResolvedValue(true);
  mockSendRefundInitiated.mockResolvedValue(true);
  mockShiprocketLogin.mockResolvedValue("test-token");
  mockGetReturnShippingRate.mockResolvedValue(80);
  mockCreateReturnOrder.mockResolvedValue({
    order_id: "SR-123",
    shipment_id: "SH-456",
    awb_code: "AWB789",
  });

  mockFetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", mockFetch);
});

// ─── A: Auth & Input Guards ─────────────────────────────────────────────────────

describe("A — auth & input guards", () => {
  it("A1: CSRF fails → 403", async () => {
    mockRequireCsrf.mockResolvedValue({ valid: false, error: "Invalid CSRF" });
    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(403);
  });

  it("A2: auth fails → 401", async () => {
    const err = new Error("Not authorized");
    err.name = "AuthError";
    mockRequireRole.mockRejectedValue(err);
    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(401);
  });

  it("A3: missing orderId → 400", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/order id required/i);
  });

  it("A4: DB error on fetch → 500", async () => {
    mockOrderSingle.mockResolvedValue({ data: null, error: { message: "DB error" } });
    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/database error/i);
  });

  it("A5: order not found → 404", async () => {
    mockOrderSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(404);
  });

  it("A6: order not in cancellation or return state → 400", async () => {
    mockOrderSingle.mockResolvedValue({
      data: baseOrder({ order_status: "CONFIRMED" }),
      error: null,
    });
    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not in cancellation or return/i);
  });
});

// ─── B: Return Pickup Retry ─────────────────────────────────────────────────────

describe("B — return pickup retry", () => {
  const returnFailedOrder = () =>
    baseOrder({
      order_status: "RETURN_REQUESTED",
      return_status: "RETURN_FAILED",
      shipping_first_name: "Test",
      shipping_last_name: "User",
    });

  it("B1: createReturnOrder succeeds → 200 with refundAmount", async () => {
    mockOrderSingle.mockResolvedValue({ data: returnFailedOrder(), error: null });
    const res = await POST(makeRequest({ orderId: UUID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.refundAmount).toBeDefined();

    const pickupUpdate = updateCalls.find(
      (u: any) => u.return_status === "RETURN_PICKUP_SCHEDULED"
    );
    expect(pickupUpdate).toBeTruthy();
  });

  it("B2: createReturnOrder throws → 500", async () => {
    mockOrderSingle.mockResolvedValue({ data: returnFailedOrder(), error: null });
    mockCreateReturnOrder.mockRejectedValue(new Error("Shiprocket error"));
    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/return pickup retry failed/i);
  });

  it("B3: getReturnShippingRate fails → uses fallback 80", async () => {
    mockOrderSingle.mockResolvedValue({ data: returnFailedOrder(), error: null });
    mockGetReturnShippingRate.mockRejectedValue(new Error("Rate error"));
    const res = await POST(makeRequest({ orderId: UUID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    // total 1000 - forward 50 - fallback return 80 = 870
    expect(body.refundAmount).toBe(870);
  });
});

// ─── C: Return Refund Retry ─────────────────────────────────────────────────────

describe("C — return refund retry", () => {
  const returnRefundFailedOrder = (overrides: Record<string, any> = {}) =>
    baseOrder({
      order_status: "RETURN_REQUESTED",
      return_status: "RETURN_DELIVERED",
      refund_status: "REFUND_FAILED",
      return_refund_amount: 870,
      ...overrides,
    });

  it("C1: Razorpay processed → 200 RETURN_COMPLETED", async () => {
    mockOrderSingle.mockResolvedValue({ data: returnRefundFailedOrder(), error: null });
    const res = await POST(makeRequest({ orderId: UUID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.refundAmount).toBeDefined();

    const completedUpdate = updateCalls.find(
      (u: any) => u.refund_status === "REFUND_COMPLETED"
    );
    expect(completedUpdate).toMatchObject({
      return_status: "RETURN_COMPLETED",
      order_status: "RETURNED",
      refund_attempted_at: expect.any(String),
      refund_completed_at: expect.any(String),
    });
  });

  it("C2: Razorpay pending → 200 with pending flag", async () => {
    mockOrderSingle.mockResolvedValue({ data: returnRefundFailedOrder(), error: null });
    mockPaymentsRefund.mockResolvedValue({
      id: "rfnd_pending",
      status: "created",
      amount: 87000,
    });
    const res = await POST(makeRequest({ orderId: UUID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pending).toBe(true);
    expect(body.refundId).toBe("rfnd_pending");

    const initiatedUpdate = updateCalls.find(
      (u: any) => u.refund_id === "rfnd_pending"
    );
    expect(initiatedUpdate).toMatchObject({
      refund_status: "REFUND_INITIATED",
    });
    // refund_attempted_at should NOT be set on pending
    expect(initiatedUpdate.refund_attempted_at).toBeUndefined();
  });

  it("C3: Razorpay throws → 500 REFUND_FAILED", async () => {
    mockOrderSingle.mockResolvedValue({ data: returnRefundFailedOrder(), error: null });
    mockPaymentsRefund.mockRejectedValue({
      error: { code: "ERROR", reason: "fail", description: "fail" },
    });
    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(500);

    const failUpdate = updateCalls.find(
      (u: any) => u.refund_status === "REFUND_FAILED"
    );
    expect(failUpdate).toBeTruthy();
    expect(failUpdate.refund_attempted_at).toBeDefined();
    expect(failUpdate.refund_error_code).toBe("ERROR");
  });

  it("C4: recalculates refund when return_refund_amount is null", async () => {
    mockOrderSingle.mockResolvedValue({
      data: returnRefundFailedOrder({ return_refund_amount: null }),
      error: null,
    });
    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(200);
    // Should have fetched order_items to recalculate
    expect(mockItemsEq).toHaveBeenCalled();
  });
});

// ─── D: Return No Matching Scenario ─────────────────────────────────────────────

describe("D — return no matching scenario", () => {
  it("D1: unhandled return status → 200 Return processed", async () => {
    mockOrderSingle.mockResolvedValue({
      data: baseOrder({
        order_status: "RETURN_REQUESTED",
        return_status: "RETURN_PICKUP_SCHEDULED",
      }),
      error: null,
    });
    const res = await POST(makeRequest({ orderId: UUID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.message).toMatch(/return processed/i);
  });
});

// ─── E: Shiprocket Cancel Retry ─────────────────────────────────────────────────

describe("E — shiprocket cancel retry", () => {
  const shiprocketFailedOrder = () =>
    baseOrder({
      shiprocket_order_id: "SR-100",
      shiprocket_status: "SHIPPING_CANCELLATION_FAILED",
    });

  it("E1: Shiprocket login fails → 503", async () => {
    mockOrderSingle.mockResolvedValue({ data: shiprocketFailedOrder(), error: null });
    mockShiprocketLogin.mockResolvedValue(null);
    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(503);
  });

  it("E2: Shiprocket cancel API fails → 400", async () => {
    mockOrderSingle.mockResolvedValue({ data: shiprocketFailedOrder(), error: null });
    mockFetch.mockResolvedValue({ ok: false });
    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(400);
  });
});

// ─── F: Cancellation Refund Eligibility ─────────────────────────────────────────

describe("F — cancellation refund eligibility", () => {
  it("F1: already refunded → 200 Retry processed", async () => {
    const order = baseOrder({ refund_status: "REFUND_COMPLETED" });
    mockOrderSingle
      .mockResolvedValueOnce({ data: order, error: null }) // initial
      .mockResolvedValueOnce({ data: order, error: null }); // re-fetch
    const res = await POST(makeRequest({ orderId: UUID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.message).toMatch(/retry processed/i);
  });

  it("F2: shipping not resolved → 200 Retry processed", async () => {
    const order = baseOrder({ shiprocket_status: "AWB_ASSIGNED" });
    mockOrderSingle
      .mockResolvedValueOnce({ data: order, error: null })
      .mockResolvedValueOnce({ data: order, error: null });
    const res = await POST(makeRequest({ orderId: UUID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.message).toMatch(/retry processed/i);
  });
});

// ─── G: Cancellation Refund Lock + Processing ───────────────────────────────────

describe("G — cancellation refund lock + processing", () => {
  function setupCancellationRefund() {
    // Initial fetch + re-fetch (after shiprocket section, which is skipped)
    mockOrderSingle
      .mockResolvedValueOnce({ data: baseOrder(), error: null })
      .mockResolvedValueOnce({ data: baseOrder(), error: null });
  }

  it("G1: lock fails (concurrent) → 400", async () => {
    setupCancellationRefund();
    mockSelectAfterUpdate.mockResolvedValueOnce({ data: [], error: null });
    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unable to initiate refund/i);
  });

  it("G2: Razorpay processed → 200 success with credit note + email", async () => {
    setupCancellationRefund();
    // Lock result + refund update result
    mockSelectAfterUpdate
      .mockResolvedValueOnce({
        data: [baseOrder({ refund_status: "REFUND_INITIATED" })],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          baseOrder({
            order_status: "CANCELLED",
            cancellation_status: "CANCELLED",
            refund_status: "REFUND_COMPLETED",
            guest_email: "test@example.com",
          }),
        ],
        error: null,
      });

    const res = await POST(makeRequest({ orderId: UUID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.refundAmount).toBe(1000);

    // Verify credit note generation was attempted
    expect(mockGenerateCreditNoteNumber).toHaveBeenCalled();
    // Verify refund email was sent
    expect(mockSendRefundInitiated).toHaveBeenCalled();
  });

  it("G3: Razorpay pending → 200 with pending flag", async () => {
    setupCancellationRefund();
    mockSelectAfterUpdate.mockResolvedValueOnce({
      data: [baseOrder({ refund_status: "REFUND_INITIATED" })],
      error: null,
    });
    mockPaymentsRefund.mockResolvedValue({
      id: "rfnd_pending",
      status: "created",
      amount: 100000,
    });

    const res = await POST(makeRequest({ orderId: UUID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pending).toBe(true);
    expect(body.refundId).toBe("rfnd_pending");
  });

  it("G4: Razorpay throws → 500 REFUND_FAILED", async () => {
    setupCancellationRefund();
    mockSelectAfterUpdate.mockResolvedValueOnce({
      data: [baseOrder({ refund_status: "REFUND_INITIATED" })],
      error: null,
    });
    mockPaymentsRefund.mockRejectedValue({
      error: { code: "UNKNOWN", reason: "", description: "Error" },
    });

    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(500);

    const failUpdate = updateCalls.find(
      (u: any) => u.refund_status === "REFUND_FAILED"
    );
    expect(failUpdate).toBeTruthy();
    expect(failUpdate.refund_attempted_at).toBeDefined();
  });

  it("G5: credit note email failure is non-fatal", async () => {
    setupCancellationRefund();
    mockSelectAfterUpdate
      .mockResolvedValueOnce({
        data: [baseOrder({ refund_status: "REFUND_INITIATED" })],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          baseOrder({
            order_status: "CANCELLED",
            refund_status: "REFUND_COMPLETED",
            guest_email: "test@example.com",
          }),
        ],
        error: null,
      });
    mockSendCreditNote.mockRejectedValue(new Error("Email failed"));

    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("G6: lock works for both null and REFUND_FAILED refund_status", async () => {
    // Test with REFUND_FAILED (retry scenario)
    const retryOrder = baseOrder({ refund_status: "REFUND_FAILED" });
    mockOrderSingle
      .mockResolvedValueOnce({ data: retryOrder, error: null })
      .mockResolvedValueOnce({ data: retryOrder, error: null });
    mockSelectAfterUpdate
      .mockResolvedValueOnce({
        data: [{ ...retryOrder, refund_status: "REFUND_INITIATED" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            ...retryOrder,
            order_status: "CANCELLED",
            refund_status: "REFUND_COMPLETED",
            guest_email: "test@example.com",
          },
        ],
        error: null,
      });

    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});
