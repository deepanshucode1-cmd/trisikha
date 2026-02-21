/**
 * tests/payment-verify.test.ts
 *
 * Direct handler import tests for app/api/payment/verify/route.ts
 * Covers:
 *   N — gateway payment status checks
 *   O — amount validation with tolerance
 *   P — DB state / idempotency
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ─── Mock declarations (vi.hoisted ensures these exist before vi.mock factories run) ───

const { mockSingle, mockOrderUpdate, mockItemsEq, mockPaymentsFetch, mockRateLimit } =
  vi.hoisted(() => ({
    mockSingle: vi.fn(),
    mockOrderUpdate: vi.fn(),
    mockItemsEq: vi.fn(),
    mockPaymentsFetch: vi.fn(),
    mockRateLimit: vi.fn(),
  }));

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/utils/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "orders") {
        return {
          // .select(...).eq(...).single()  — used for order lookup
          select: () => ({
            eq: () => ({
              single: mockSingle,
            }),
          }),
          // .update({...}).eq(...).eq(...).select()  — conditional idempotency update
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: mockOrderUpdate,
              }),
            }),
          }),
        };
      }
      if (table === "order_items") {
        return {
          select: () => ({
            eq: mockItemsEq,
          }),
        };
      }
    },
  }),
}));

vi.mock("razorpay", () => ({
  // Must be a regular function (not arrow) to support `new Razorpay()`
  default: vi.fn(function () {
    return { payments: { fetch: mockPaymentsFetch } };
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  paymentRateLimit: { limit: mockRateLimit },
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({}),
    })),
  },
}));

vi.mock("@/lib/receipt", () => ({
  generateReceiptPDF: vi.fn().mockResolvedValue(Buffer.from("pdf")),
}));

vi.mock("@/lib/logger", () => ({
  logPayment: vi.fn(),
  logOrder: vi.fn(),
  trackSecurityEvent: vi.fn().mockResolvedValue(undefined),
  logSecurityEvent: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/errors", () => ({
  handleApiError: vi.fn((err: unknown) => {
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
  }),
}));

// ─── Import handler after mocks ────────────────────────────────────────────────

import { POST } from "@/app/api/payment/verify/route";

// ─── Test helpers ──────────────────────────────────────────────────────────────

const KEY_SECRET = "test-key-secret-32-chars-minimum!!";
const UUID = "123e4567-e89b-12d3-a456-426614174000";
const RPY_ORDER_ID = "order_testABC123";
const RPY_PAYMENT_ID = "pay_testXYZ456";

function makeHmac(orderId: string, paymentId: string): string {
  return crypto
    .createHmac("sha256", KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

function makeRequest(body: object): Request {
  return new Request("http://localhost:3000/api/payment/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Partial<{
  order_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}> = {}) {
  const orderId = overrides.razorpay_order_id ?? RPY_ORDER_ID;
  const paymentId = overrides.razorpay_payment_id ?? RPY_PAYMENT_ID;
  return {
    order_id: overrides.order_id ?? UUID,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: overrides.razorpay_signature ?? makeHmac(orderId, paymentId),
  };
}

// Stub env vars used by the route for HMAC verification
vi.stubEnv("RAZORPAY_KEY_SECRET", KEY_SECRET);
vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");

// ─── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: rate limit passes
  mockRateLimit.mockResolvedValue({
    success: true,
    limit: 10,
    reset: Date.now() + 60_000,
    remaining: 9,
  });

  // Default: payment is captured at ₹500
  mockPaymentsFetch.mockResolvedValue({ status: "captured", amount: 50_000 });

  // Default: order found, initiated, ₹500
  mockSingle.mockResolvedValue({
    data: {
      total_amount: 500,
      guest_email: "customer@example.com",
      payment_status: "initiated",
    },
    error: null,
  });

  // Default: update succeeds with 1 row
  mockOrderUpdate.mockResolvedValue({
    data: [{ total_amount: 500, guest_email: "customer@example.com" }],
    error: null,
  });

  // Default: order_items empty (email send is best-effort)
  mockItemsEq.mockResolvedValue({ data: [], error: null });
});

// ─── Section N: gateway payment status ────────────────────────────────────────

describe("N — gateway payment status", () => {
  it('N1: "captured" proceeds past gateway check → 200', async () => {
    mockPaymentsFetch.mockResolvedValue({ status: "captured", amount: 50_000 });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).not.toBe(400);
  });

  it('N2: "authorized" status → 400 (regression guard)', async () => {
    mockPaymentsFetch.mockResolvedValue({ status: "authorized", amount: 50_000 });
    const res = await POST(makeRequest(validBody()));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/not successful at gateway/i);
  });

  it('N3: "failed" status → 400', async () => {
    mockPaymentsFetch.mockResolvedValue({ status: "failed", amount: 50_000 });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
  });

  it('N4: "created" status → 400', async () => {
    mockPaymentsFetch.mockResolvedValue({ status: "created", amount: 0 });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
  });
});

// ─── Section O: amount validation ─────────────────────────────────────────────

describe("O — amount validation (order.total_amount = ₹500)", () => {
  beforeEach(() => {
    mockPaymentsFetch.mockResolvedValue({ status: "captured", amount: 50_000 }); // overridden per test
  });

  it("O1: 50000 paise (₹500.00) exactly → 200", async () => {
    mockPaymentsFetch.mockResolvedValue({ status: "captured", amount: 50_000 });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
  });

  it("O2: 100 paise (₹1.00) — far off → 400", async () => {
    mockPaymentsFetch.mockResolvedValue({ status: "captured", amount: 100 });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/amount mismatch/i);
  });

  it("O3: 99900 paise (₹999.00) — far off → 400", async () => {
    mockPaymentsFetch.mockResolvedValue({ status: "captured", amount: 99_900 });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
  });

  it("O4: 50001 paise (₹500.01) — Δ=0.01, within ±0.01 → 200", async () => {
    mockPaymentsFetch.mockResolvedValue({ status: "captured", amount: 50_001 });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
  });

  it("O5: 50002 paise (₹500.02) — Δ=0.02, outside ±0.01 → 400", async () => {
    mockPaymentsFetch.mockResolvedValue({ status: "captured", amount: 50_002 });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
  });
});

// ─── Section P: DB state / idempotency ────────────────────────────────────────

describe("P — DB state / idempotency", () => {
  it("P1: order not found → 404", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "Not found" } });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(404);
  });

  it("P2: already paid (conditional update returns 0 rows, payment_status=paid) → 200 already processed", async () => {
    mockSingle.mockResolvedValue({
      data: {
        total_amount: 500,
        guest_email: "customer@example.com",
        payment_status: "paid", // already paid
      },
      error: null,
    });
    mockOrderUpdate.mockResolvedValue({ data: [], error: null }); // 0 rows updated

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/already processed/i);
  });

  it("P3: initiated → conditional update returns 1 row → 200 success", async () => {
    // Default mocks: initiated order, update returns 1 row
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("P4: DB update fails (error from Supabase) → 200 with warning", async () => {
    mockOrderUpdate.mockResolvedValue({ data: null, error: { message: "DB connection error" } });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.warning).toBeTruthy();
  });
});
