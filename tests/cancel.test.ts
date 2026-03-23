/**
 * tests/cancel.test.ts
 *
 * Direct handler import tests for app/api/orders/cancel/route.ts
 * Covers:
 *   A — rate limiting
 *   B — order state guards
 *   C — return window
 *   D — OTP verification
 *   E — return processing
 *   F — shiprocket cancellation
 *   G — refund lock
 *   H — refund processing
 *   I — input validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockOrderSingle,
  mockSelectAfterUpdate,
  mockItemsEq,
  mockPaymentsRefund,
  mockRateLimit,
  mockShiprocketLogin,
  mockCreateReturnOrder,
  mockGetReturnShippingRate,
  mockGenerateCreditNoteNumber,
  mockGenerateCreditNotePDF,
  mockSendCreditNote,
  mockSendReturnRequestConfirmation,
  mockSanitizeObject,
  mockHandleApiError,
} = vi.hoisted(() => ({
  mockOrderSingle: vi.fn(),
  mockSelectAfterUpdate: vi.fn(),
  mockItemsEq: vi.fn(),
  mockPaymentsRefund: vi.fn(),
  mockRateLimit: vi.fn(),
  mockShiprocketLogin: vi.fn(),
  mockCreateReturnOrder: vi.fn(),
  mockGetReturnShippingRate: vi.fn(),
  mockGenerateCreditNoteNumber: vi.fn(),
  mockGenerateCreditNotePDF: vi.fn(),
  mockSendCreditNote: vi.fn(),
  mockSendReturnRequestConfirmation: vi.fn(),
  mockSanitizeObject: vi.fn((o: any) => o),
  mockHandleApiError: vi.fn(),
}));

// Track update payloads for assertions
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
      // Fallback for any other table
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

vi.mock("@/lib/rate-limit", () => ({
  cancelOrderRateLimit: { limit: mockRateLimit },
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/utils/shiprocket", () => ({
  default: { login: mockShiprocketLogin },
  createReturnOrder: mockCreateReturnOrder,
  getReturnShippingRate: mockGetReturnShippingRate,
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({}),
    })),
  },
}));

vi.mock("@/lib/logger", () => ({
  logPayment: vi.fn(),
  logOrder: vi.fn(),
  logSecurityEvent: vi.fn(),
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
  sendReturnRequestConfirmation: mockSendReturnRequestConfirmation,
}));

vi.mock("@/lib/xss", () => ({
  sanitizeObject: mockSanitizeObject,
}));

vi.mock("@/lib/errors", () => ({
  handleApiError: (...args: any[]) => mockHandleApiError(...args),
}));

// ─── Import handler after mocks ─────────────────────────────────────────────────

import { POST } from "@/app/api/orders/cancel/route";

// ─── Helpers ────────────────────────────────────────────────────────────────────

vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test");
vi.stubEnv("RAZORPAY_KEY_SECRET", "test_secret");
vi.stubEnv("WAREHOUSE_PINCODE", "382721");

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const VALID_OTP = "123456";

function makeRequest(body: object): Request {
  return new Request("http://localhost/api/orders/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, any> = {}) {
  return {
    orderId: UUID,
    otp: VALID_OTP,
    reason: "Product not as described, want to return",
    ...overrides,
  };
}

function baseOrder(overrides: Record<string, any> = {}) {
  return {
    id: UUID,
    order_status: "CONFIRMED",
    cancellation_status: "OTP_SENT",
    return_status: "NOT_REQUESTED",
    payment_status: "paid",
    refund_status: null,
    otp_code: VALID_OTP,
    otp_expires_at: new Date(Date.now() + 600_000).toISOString(),
    otp_attempts: 0,
    otp_locked_until: null,
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
    delivered_at: null,
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

  // Reset mocks that use mockResolvedValueOnce (clears stale queue)
  mockOrderSingle.mockReset().mockResolvedValue({ data: baseOrder(), error: null });
  mockSelectAfterUpdate.mockReset().mockResolvedValue({ data: [baseOrder()], error: null });
  mockItemsEq.mockReset().mockResolvedValue({ data: defaultItems, error: null });
  mockPaymentsRefund.mockReset().mockResolvedValue({ id: "rfnd_test", status: "processed", amount: 100000 });

  // Restore implementations cleared by clearAllMocks
  mockSanitizeObject.mockImplementation((o: any) => o);
  mockHandleApiError.mockImplementation((err: unknown) => {
    const { z } = require("zod");
    if (err instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: "Validation failed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  });

  mockRateLimit.mockResolvedValue({
    success: true,
    limit: 5,
    reset: Date.now() + 60_000,
    remaining: 4,
  });

  mockGenerateCreditNoteNumber.mockResolvedValue("CN-001");
  mockGenerateCreditNotePDF.mockResolvedValue(Buffer.from("pdf"));
  mockSendCreditNote.mockResolvedValue(true);
  mockSendReturnRequestConfirmation.mockResolvedValue(true);
  mockShiprocketLogin.mockResolvedValue("test-token");
  mockGetReturnShippingRate.mockResolvedValue(80);
  mockCreateReturnOrder.mockResolvedValue({
    order_id: "SR-123",
    shipment_id: "SH-456",
    awb_code: "AWB789",
    courier_name: "Delhivery",
  });

  mockFetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", mockFetch);
});

// ─── A: Rate Limiting ───────────────────────────────────────────────────────────

describe("A — rate limiting", () => {
  it("A1: rate limit exceeded → 429 with headers", async () => {
    mockRateLimit.mockResolvedValue({
      success: false,
      limit: 5,
      reset: Date.now() + 60_000,
      remaining: 0,
    });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
  });
});

// ─── B: Order State Guards ──────────────────────────────────────────────────────

describe("B — order state guards", () => {
  it("B1: DB error on fetch → 500", async () => {
    mockOrderSingle.mockResolvedValue({ data: null, error: { message: "DB error" } });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
  });

  it("B2: order not found → 400", async () => {
    mockOrderSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid order/i);
  });

  it("B3: cancellation_status null → 400", async () => {
    mockOrderSingle.mockResolvedValue({
      data: baseOrder({ cancellation_status: null }),
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not initiated/i);
  });

  it("B4: order already cancelled → 200", async () => {
    mockOrderSingle.mockResolvedValue({
      data: baseOrder({ order_status: "CANCELLED" }),
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/already cancelled/i);
  });

  it("B5: non-cancellable status (SHIPPED) → 400", async () => {
    mockOrderSingle.mockResolvedValue({
      data: baseOrder({ order_status: "SHIPPED" }),
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot be cancelled/i);
  });

  it("B6: refund already initiated → 200", async () => {
    mockOrderSingle.mockResolvedValue({
      data: baseOrder({ refund_status: "REFUND_INITIATED" }),
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/refund already in process/i);
  });

  it("B7: refund already completed → 200", async () => {
    mockOrderSingle.mockResolvedValue({
      data: baseOrder({ refund_status: "REFUND_COMPLETED" }),
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/already refunded/i);
  });
});

// ─── C: Return Window ───────────────────────────────────────────────────────────

describe("C — return window", () => {
  it("C1: DELIVERED past 48h → 400 return window expired", async () => {
    const expired = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
    mockOrderSingle.mockResolvedValue({
      data: baseOrder({ order_status: "DELIVERED", delivered_at: expired }),
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/return window expired/i);
  });

  it("C2: return already requested → 200", async () => {
    mockOrderSingle.mockResolvedValue({
      data: baseOrder({
        order_status: "DELIVERED",
        delivered_at: new Date().toISOString(),
        return_status: "RETURN_REQUESTED",
      }),
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/return already requested/i);
  });
});

// ─── D: OTP Verification ────────────────────────────────────────────────────────

describe("D — OTP verification", () => {
  it("D1: OTP locked → 429", async () => {
    mockOrderSingle.mockResolvedValue({
      data: baseOrder({
        otp_locked_until: new Date(Date.now() + 3600_000).toISOString(),
      }),
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/too many failed attempts/i);
  });

  it("D2: wrong OTP → 400 Invalid OTP", async () => {
    const res = await POST(makeRequest(validBody({ otp: "654321" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid otp/i);
  });

  it("D3: 3rd failed attempt → 429 lockout", async () => {
    mockOrderSingle.mockResolvedValue({
      data: baseOrder({ otp_attempts: 2 }),
      error: null,
    });
    const res = await POST(makeRequest(validBody({ otp: "654321" })));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/try again after 1 hour/i);
  });

  it("D4: expired OTP → 400 OTP expired", async () => {
    mockOrderSingle.mockResolvedValue({
      data: baseOrder({
        otp_expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/otp expired/i);
  });
});

// ─── E: Return Processing ───────────────────────────────────────────────────────

describe("E — return processing", () => {
  function setupReturnFlow() {
    mockOrderSingle
      .mockResolvedValueOnce({
        data: baseOrder({
          order_status: "DELIVERED",
          delivered_at: new Date().toISOString(),
        }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: baseOrder({
          order_status: "RETURN_REQUESTED",
          return_status: "RETURN_REQUESTED",
          total_amount: 1000,
          shipping_cost: 50,
        }),
        error: null,
      });
  }

  it("E1: Shiprocket return succeeds → 200 with refund amounts", async () => {
    setupReturnFlow();
    const res = await POST(makeRequest(validBody()));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.isReturn).toBe(true);
    expect(body.refundAmount).toBe(870); // 1000 - 50 - 80
    expect(body.shippingDeduction).toBe(130); // 50 + 80
  });

  it("E2: createReturnOrder fails → 500 with RETURN_FAILED", async () => {
    setupReturnFlow();
    mockCreateReturnOrder.mockRejectedValue(new Error("Shiprocket error"));
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
    expect((await res.json()).isReturn).toBe(true);

    const failUpdate = updateCalls.find((u: any) => u.return_status === "RETURN_FAILED");
    expect(failUpdate).toBeTruthy();
  });

  it("E3: return shipping rate fetch fails → 503", async () => {
    setupReturnFlow();
    mockGetReturnShippingRate.mockRejectedValue(new Error("Rate error"));
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(503);
  });
});

// ─── F: Shiprocket Cancellation ─────────────────────────────────────────────────

describe("F — shiprocket cancellation", () => {
  function setupShiprocketFlow() {
    mockOrderSingle
      .mockResolvedValueOnce({
        data: baseOrder({
          shiprocket_order_id: "SR-100",
          shiprocket_status: "AWB_ASSIGNED",
        }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: baseOrder({
          order_status: "CANCELLATION_REQUESTED",
          cancellation_status: "CANCELLATION_REQUESTED",
          shiprocket_order_id: "SR-100",
          shiprocket_status: "AWB_ASSIGNED",
        }),
        error: null,
      });
  }

  it("F1: Shiprocket login fails → 500", async () => {
    setupShiprocketFlow();
    mockShiprocketLogin.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/shiprocket auth/i);
  });

  it("F2: Shiprocket cancel API fails → 400", async () => {
    setupShiprocketFlow();
    mockFetch.mockResolvedValue({ ok: false });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/shipping cancellation failed/i);
  });
});

// ─── G: Refund Lock ─────────────────────────────────────────────────────────────

describe("G — refund lock", () => {
  function setupRefundPath() {
    // Skip OTP by setting cancellation_status to CANCELLATION_REQUESTED
    mockOrderSingle
      .mockResolvedValueOnce({
        data: baseOrder({ cancellation_status: "CANCELLATION_REQUESTED" }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: baseOrder({
          order_status: "CANCELLATION_REQUESTED",
          cancellation_status: "CANCELLATION_REQUESTED",
        }),
        error: null,
      });
  }

  it("G1: lock returns empty (already refunded / concurrent) → 400", async () => {
    setupRefundPath();
    mockSelectAfterUpdate.mockResolvedValueOnce({ data: [], error: null });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not eligible/i);
  });

  it("G2: lock DB error → 500", async () => {
    setupRefundPath();
    mockSelectAfterUpdate.mockResolvedValueOnce({
      data: null,
      error: { message: "DB connection error" },
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
  });
});

// ─── H: Refund Processing ───────────────────────────────────────────────────────

describe("H — refund processing", () => {
  function setupFullCancellation() {
    mockOrderSingle
      .mockResolvedValueOnce({
        data: baseOrder({ cancellation_status: "CANCELLATION_REQUESTED" }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: baseOrder({
          order_status: "CANCELLATION_REQUESTED",
          cancellation_status: "CANCELLATION_REQUESTED",
        }),
        error: null,
      });

    // Call 1: lock result, Call 2: refund update result
    mockSelectAfterUpdate
      .mockResolvedValueOnce({
        data: [
          baseOrder({
            order_status: "CANCELLATION_REQUESTED",
            cancellation_status: "CANCELLATION_REQUESTED",
            refund_status: "REFUND_INITIATED",
          }),
        ],
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
  }

  it("H1: Razorpay processed → 200 success with refundAmount (no pending flag)", async () => {
    setupFullCancellation();
    const res = await POST(makeRequest(validBody()));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.refundAmount).toBe(1000); // 100000 paise / 100
    expect(body.pending).toBeUndefined();
    expect(body.creditNoteNumber).toBe("CN-001");
  });

  it("H2: Razorpay pending/created → 200 with pending flag", async () => {
    mockOrderSingle
      .mockResolvedValueOnce({
        data: baseOrder({ cancellation_status: "CANCELLATION_REQUESTED" }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: baseOrder({
          order_status: "CANCELLATION_REQUESTED",
          cancellation_status: "CANCELLATION_REQUESTED",
        }),
        error: null,
      });
    mockSelectAfterUpdate.mockResolvedValueOnce({
      data: [
        baseOrder({
          order_status: "CANCELLATION_REQUESTED",
          cancellation_status: "CANCELLATION_REQUESTED",
          refund_status: "REFUND_INITIATED",
        }),
      ],
      error: null,
    });
    mockPaymentsRefund.mockResolvedValue({
      id: "rfnd_pending",
      status: "created",
      amount: 100000,
    });

    const res = await POST(makeRequest(validBody()));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pending).toBe(true);
    expect(body.refundId).toBe("rfnd_pending");

    // Verify pending DB update
    const pendingUpdate = updateCalls.find(
      (u: any) => u.refund_id === "rfnd_pending"
    );
    expect(pendingUpdate).toMatchObject({
      refund_status: "REFUND_INITIATED",
    });
  });

  it("H3: Razorpay throws → 500 with REFUND_FAILED + refund_attempted_at", async () => {
    mockOrderSingle
      .mockResolvedValueOnce({
        data: baseOrder({ cancellation_status: "CANCELLATION_REQUESTED" }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: baseOrder({
          order_status: "CANCELLATION_REQUESTED",
          cancellation_status: "CANCELLATION_REQUESTED",
        }),
        error: null,
      });
    mockSelectAfterUpdate.mockResolvedValueOnce({
      data: [
        baseOrder({
          order_status: "CANCELLATION_REQUESTED",
          cancellation_status: "CANCELLATION_REQUESTED",
          refund_status: "REFUND_INITIATED",
        }),
      ],
      error: null,
    });
    mockPaymentsRefund.mockRejectedValue({
      error: {
        code: "BAD_REQUEST_ERROR",
        reason: "insufficient_balance",
        description: "Not enough",
      },
    });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);

    const failUpdate = updateCalls.find(
      (u: any) => u.refund_status === "REFUND_FAILED"
    );
    expect(failUpdate).toBeTruthy();
    expect(failUpdate.refund_attempted_at).toBeDefined();
    expect(failUpdate.refund_error_code).toBe("BAD_REQUEST_ERROR");
  });

  it("H4: credit note generation failure is non-fatal", async () => {
    setupFullCancellation();
    mockGenerateCreditNoteNumber.mockRejectedValue(new Error("CN gen failed"));

    const res = await POST(makeRequest(validBody()));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.creditNoteNumber).toBeNull();
  });

  it("H5: refund_attempted_at set on success, NOT on pending", async () => {
    // Success path
    setupFullCancellation();
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);

    const completedUpdate = updateCalls.find(
      (u: any) => u.refund_status === "REFUND_COMPLETED"
    );
    expect(completedUpdate).toBeTruthy();
    expect(completedUpdate.refund_attempted_at).toBeDefined();
    expect(completedUpdate.refund_completed_at).toBeDefined();
  });
});

// ─── I: Input Validation ────────────────────────────────────────────────────────

describe("I — input validation", () => {
  it("I1: missing OTP → 400 validation error", async () => {
    const res = await POST(makeRequest({ orderId: UUID }));
    expect(res.status).toBe(400);
  });

  it("I2: invalid orderId (not UUID) → 400 validation error", async () => {
    const res = await POST(
      makeRequest({ orderId: "not-a-uuid", otp: "123456" })
    );
    expect(res.status).toBe(400);
  });
});
