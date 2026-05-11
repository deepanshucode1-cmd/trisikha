import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

interface QueuedResponse {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
  payload?: Record<string, unknown>;
}

interface ScriptedSupabase {
  supabase: { from: ReturnType<typeof vi.fn> };
  queues: Record<string, QueuedResponse[]>;
  calls: RecordedCall[];
  setResponses: (table: string, responses: QueuedResponse[]) => void;
}

function createScriptedSupabase(): ScriptedSupabase {
  const queues: Record<string, QueuedResponse[]> = {};
  const calls: RecordedCall[] = [];

  function consumeNext(table: string): QueuedResponse {
    const queue = queues[table];
    if (!queue || queue.length === 0) return { data: null, error: null };
    return queue.shift()!;
  }

  function buildChain(table: string) {
    const record = (method: string, args: unknown[]) => {
      const entry: RecordedCall = { table, method, args };
      if (method === "update") entry.payload = args[0] as Record<string, unknown>;
      calls.push(entry);
    };

    const chain: Record<string, unknown> = {};

    chain.select = vi.fn((...args: unknown[]) => {
      record("select", args);
      return chain;
    });
    chain.insert = vi.fn((...args: unknown[]) => {
      record("insert", args);
      return chain;
    });
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      record("update", [payload]);
      return chain;
    });
    chain.delete = vi.fn(() => {
      record("delete", []);
      return chain;
    });
    chain.eq = vi.fn((col: string, val: unknown) => {
      record("eq", [col, val]);
      return chain;
    });
    chain.neq = vi.fn((col: string, val: unknown) => {
      record("neq", [col, val]);
      return chain;
    });
    chain.in = vi.fn((col: string, val: unknown) => {
      record("in", [col, val]);
      return chain;
    });
    chain.is = vi.fn((col: string, val: unknown) => {
      record("is", [col, val]);
      return chain;
    });
    chain.lt = vi.fn((col: string, val: unknown) => {
      record("lt", [col, val]);
      return chain;
    });
    chain.lte = vi.fn((col: string, val: unknown) => {
      record("lte", [col, val]);
      return chain;
    });
    chain.order = vi.fn(() => {
      record("order", []);
      return chain;
    });
    chain.single = vi.fn(() => Promise.resolve(consumeNext(table)));
    chain.then = (resolve: (v: QueuedResponse) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(consumeNext(table)).then(resolve, reject);

    return chain;
  }

  return {
    supabase: { from: vi.fn((table: string) => buildChain(table)) },
    queues,
    calls,
    setResponses(table, responses) {
      queues[table] = [...responses];
    },
  };
}

let scripted: ScriptedSupabase = createScriptedSupabase();

vi.mock("@/utils/supabase/service", () => ({
  createServiceClient: () => scripted.supabase,
}));

const mockLogError = vi.fn();
const mockLogSecurityEvent = vi.fn();

vi.mock("@/lib/logger", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...args),
}));

const mockLogDataAccess = vi.fn().mockResolvedValue("audit-id");

vi.mock("@/lib/audit", () => ({
  logDataAccess: (...args: unknown[]) => mockLogDataAccess(...args),
}));

import { executeDeletionRequest } from "@/lib/deletion-request";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    guest_email: "alice@test.com",
    status: "pending",
    scheduled_deletion_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    payment_status: "initiated",
    created_at: "2026-04-01T00:00:00Z",
    total_amount: 500,
    ...overrides,
  };
}

function findUpdate(table: string, predicate: (payload: Record<string, unknown>) => boolean) {
  return scripted.calls.find(
    (c) => c.table === table && c.method === "update" && predicate(c.payload || {})
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("executeDeletionRequest", () => {
  beforeEach(() => {
    scripted = createScriptedSupabase();
    vi.clearAllMocks();
  });

  // Scenario 1: CASE 2 — no paid orders, only unpaid
  it("fully deletes orders when no paid orders exist", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      { data: [buildOrder({ id: "o-1", payment_status: "initiated" })], error: null },
      { data: [{ id: "o-1" }], error: null },
    ]);

    const result = await executeDeletionRequest("req-1");

    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.ordersDeleted).toBe(1);
    expect(result.hasPaidOrders).toBe(false);
    expect(result.otpCleared).toBe(false);

    const orderOps = scripted.calls.filter((c) => c.table === "orders").map((c) => c.method);
    expect(orderOps).toContain("delete");
    expect(orderOps).not.toContain("update");

    const completeUpdate = findUpdate("deletion_requests", (p) => p.status === "completed");
    expect(completeUpdate).toBeDefined();
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "deletion_request_completed",
      expect.objectContaining({ requestId: "req-1", ordersDeleted: 1 })
    );
  });

  // Scenario 3: CASE 1 — single paid order < ₹50k → full anonymization
  it("anonymizes email/phone and names+address for paid order below threshold", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      {
        data: [
          buildOrder({
            id: "o-paid",
            payment_status: "paid",
            total_amount: 500,
            created_at: "2025-12-01T00:00:00Z",
          }),
        ],
        error: null,
      },
    ]);

    const result = await executeDeletionRequest("req-1");

    expect(result.success).toBe(true);
    expect(result.status).toBe("deferred_legal");
    expect(result.hasPaidOrders).toBe(true);
    expect(result.paidOrdersCount).toBe(1);
    expect(result.otpCleared).toBe(true);

    // Email/phone anonymized on the paid row
    const emailPhoneUpdate = findUpdate(
      "orders",
      (p) => p.guest_email === "deleted-req-1@anonymized.local" && p.guest_phone === "0000000000"
    );
    expect(emailPhoneUpdate).toBeDefined();
    expect(emailPhoneUpdate?.payload).not.toHaveProperty("shipping_first_name");

    // Names + address lines anonymized (low-value branch)
    const addressUpdate = findUpdate(
      "orders",
      (p) => p.shipping_first_name === "Deleted" && p.billing_address_line1 === "Address Removed"
    );
    expect(addressUpdate).toBeDefined();
    expect(addressUpdate?.payload).toEqual({
      shipping_first_name: "Deleted",
      shipping_last_name: "User",
      shipping_address_line1: "Address Removed",
      shipping_address_line2: null,
      billing_first_name: "Deleted",
      billing_last_name: "User",
      billing_address_line1: "Address Removed",
      billing_address_line2: null,
    });

    // Tax/identity columns NOT mutated by anonymization payloads
    const ordersUpdates = scripted.calls.filter(
      (c) => c.table === "orders" && c.method === "update"
    );
    for (const op of ordersUpdates) {
      const payload = op.payload || {};
      const forbidden = [
        "total_amount",
        "taxable_amount",
        "cgst_amount",
        "sgst_amount",
        "igst_amount",
        "total_gst_amount",
        "gst_rate",
        "supply_type",
        "payment_id",
        "paid_at",
        "shipping_state",
        "shipping_state_code",
        "shipping_pincode",
        "shipping_country",
        "shipping_city",
        "billing_state",
        "billing_state_code",
        "billing_pincode",
        "billing_country",
        "billing_city",
      ];
      for (const key of forbidden) {
        expect(payload).not.toHaveProperty(key);
      }
    }

    // Deferred-legal status set with retention end date
    const deferredUpdate = findUpdate(
      "deletion_requests",
      (p) => p.status === "deferred_legal"
    );
    expect(deferredUpdate).toBeDefined();
    expect(deferredUpdate?.payload).toMatchObject({
      otp_cleared: true,
      paid_orders_count: 1,
    });
    expect(deferredUpdate?.payload?.retention_end_date).toBeDefined();

    // Security event captures the threshold split
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "deletion_request_deferred",
      expect.objectContaining({
        ordersFullyAnonymized: 1,
        ordersEmailPhoneOnlyAnonymized: 0,
      })
    );
  });

  // Scenario 4: CASE 1 — single paid order ≥ ₹50k → email/phone only
  it("anonymizes only email/phone for paid order at or above threshold", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      {
        data: [
          buildOrder({
            id: "o-big",
            payment_status: "paid",
            total_amount: 75000,
            created_at: "2025-12-01T00:00:00Z",
          }),
        ],
        error: null,
      },
    ]);

    const result = await executeDeletionRequest("req-1");

    expect(result.success).toBe(true);
    expect(result.status).toBe("deferred_legal");
    expect(result.paidOrdersCount).toBe(1);

    // Email/phone anonymized
    const emailPhoneUpdate = findUpdate(
      "orders",
      (p) => p.guest_email === "deleted-req-1@anonymized.local"
    );
    expect(emailPhoneUpdate).toBeDefined();

    // Names/addresses NOT touched (above threshold)
    const addressUpdate = findUpdate(
      "orders",
      (p) => p.shipping_first_name === "Deleted"
    );
    expect(addressUpdate).toBeUndefined();

    // Security event reports zero fully-anonymized, one email-phone-only
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "deletion_request_deferred",
      expect.objectContaining({
        ordersFullyAnonymized: 0,
        ordersEmailPhoneOnlyAnonymized: 1,
      })
    );
  });

  // Scenario 2: CASE 2 — only failed-payment orders also get hard-deleted
  it("fully deletes failed-payment orders when no paid orders exist", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      { data: [buildOrder({ id: "o-failed", payment_status: "failed" })], error: null },
      { data: [{ id: "o-failed" }], error: null },
    ]);

    const result = await executeDeletionRequest("req-1");

    expect(result.status).toBe("completed");
    expect(result.ordersDeleted).toBe(1);
  });

  // Scenario 5: threshold edge — exactly ₹50,000 → treated as ≥ threshold
  it("treats orders at exactly ₹50,000 as above threshold (Rule 46(e))", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      {
        data: [
          buildOrder({
            id: "o-edge",
            payment_status: "paid",
            total_amount: 50000,
            created_at: "2025-12-01T00:00:00Z",
          }),
        ],
        error: null,
      },
    ]);

    await executeDeletionRequest("req-1");

    // Address NOT anonymized at exactly ₹50,000
    expect(findUpdate("orders", (p) => p.shipping_first_name === "Deleted")).toBeUndefined();

    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "deletion_request_deferred",
      expect.objectContaining({
        ordersFullyAnonymized: 0,
        ordersEmailPhoneOnlyAnonymized: 1,
      })
    );
  });

  // Scenario 6: multi-order paid customer with mixed values across orders
  it("partitions a multi-order customer correctly across the threshold", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      {
        data: [
          buildOrder({
            id: "o-low",
            payment_status: "paid",
            total_amount: 1500,
            created_at: "2026-01-01T00:00:00Z",
          }),
          buildOrder({
            id: "o-high",
            payment_status: "paid",
            total_amount: 80000,
            created_at: "2026-02-01T00:00:00Z",
          }),
        ],
        error: null,
      },
    ]);

    await executeDeletionRequest("req-1");

    // Email/phone update targeted both rows
    const emailPhoneUpdate = scripted.calls.find(
      (c) =>
        c.table === "orders" &&
        c.method === "update" &&
        (c.payload as Record<string, unknown>)?.guest_email === "deleted-req-1@anonymized.local"
    );
    expect(emailPhoneUpdate).toBeDefined();
    const emailPhoneIndex = scripted.calls.indexOf(emailPhoneUpdate!);
    const emailPhoneIn = scripted.calls
      .slice(emailPhoneIndex)
      .find((c) => c.table === "orders" && c.method === "in");
    expect(emailPhoneIn?.args[1]).toEqual(["o-low", "o-high"]);

    // Address update targeted only the low-value row
    const addressUpdate = scripted.calls.find(
      (c) =>
        c.table === "orders" &&
        c.method === "update" &&
        (c.payload as Record<string, unknown>)?.shipping_first_name === "Deleted"
    );
    expect(addressUpdate).toBeDefined();
    const addressIndex = scripted.calls.indexOf(addressUpdate!);
    const addressIn = scripted.calls
      .slice(addressIndex)
      .find((c) => c.table === "orders" && c.method === "in");
    expect(addressIn?.args[1]).toEqual(["o-low"]);

    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "deletion_request_deferred",
      expect.objectContaining({
        ordersFullyAnonymized: 1,
        ordersEmailPhoneOnlyAnonymized: 1,
      })
    );
  });

  // Scenario 7: mixed paid + unpaid → both pipelines run in CASE 1
  it("anonymizes paid orders and hard-deletes unpaid in the same call", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      {
        data: [
          buildOrder({ id: "o-paid", payment_status: "paid", total_amount: 700, created_at: "2026-01-15T00:00:00Z" }),
          buildOrder({ id: "o-unpaid", payment_status: "initiated", total_amount: 400 }),
          buildOrder({ id: "o-failed", payment_status: "failed", total_amount: 200 }),
        ],
        error: null,
      },
    ]);

    const result = await executeDeletionRequest("req-1");

    expect(result.status).toBe("deferred_legal");
    expect(result.ordersDeleted).toBe(2); // unpaid + failed deleted

    const deleteCall = scripted.calls.find((c) => c.table === "orders" && c.method === "delete");
    expect(deleteCall).toBeDefined();
    const deleteInArgs = scripted.calls.find(
      (c) =>
        c.table === "orders" &&
        c.method === "in" &&
        Array.isArray(c.args[1]) &&
        (c.args[1] as string[]).includes("o-unpaid")
    );
    expect(deleteInArgs?.args[1]).toEqual(["o-unpaid", "o-failed"]);
  });

  // Scenario 8: OTP update fails → early-return failure
  it("returns failure when OTP clear fails (no anonymization attempted)", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      { data: [buildOrder({ payment_status: "paid", total_amount: 500 })], error: null },
      { data: null, error: { message: "DB down", code: "500" } },
    ]);

    const result = await executeDeletionRequest("req-1");

    expect(result.success).toBe(false);
    expect(result.message).toBe("Failed to clear OTP data");
    expect(result.otpCleared).toBe(false);
    expect(findUpdate("orders", (p) => p.guest_email === "deleted-req-1@anonymized.local"))
      .toBeUndefined();
  });

  // Scenario 9: email/phone anonymize fails → early-return after OTP cleared
  it("returns failure when email/phone anonymization fails", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      { data: [buildOrder({ payment_status: "paid", total_amount: 500 })], error: null },
      { data: null, error: null },
      { data: null, error: { message: "Constraint violation" } },
    ]);

    const result = await executeDeletionRequest("req-1");

    expect(result.success).toBe(false);
    expect(result.message).toBe("Failed to anonymize order email/phone");
    expect(result.otpCleared).toBe(true);
    expect(findUpdate("orders", (p) => p.shipping_first_name === "Deleted")).toBeUndefined();
  });

  // Scenario 10: address anonymize fails → early-return (only triggered for low-value present)
  it("returns failure when address anonymization fails", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      { data: [buildOrder({ payment_status: "paid", total_amount: 500 })], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: { message: "Constraint violation" } },
    ]);

    const result = await executeDeletionRequest("req-1");

    expect(result.success).toBe(false);
    expect(result.message).toBe("Failed to anonymize order address PII");
    expect(result.otpCleared).toBe(true);
  });

  // Scenario 11: review_tokens anonymize fails → flow continues, error logged
  it("continues when review_tokens anonymization fails", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      { data: [buildOrder({ payment_status: "paid", total_amount: 500 })], error: null },
      { data: null, error: null }, // OTP
      { data: null, error: null }, // email/phone
      { data: null, error: null }, // address
    ]);
    scripted.setResponses("review_tokens", [
      { data: null, error: { message: "tokens table failure" } },
    ]);

    const result = await executeDeletionRequest("req-1");

    expect(result.success).toBe(true);
    expect(result.status).toBe("deferred_legal");
    expect(mockLogError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        context: "execute_deletion_anonymize_review_tokens_failed",
      })
    );
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "deletion_request_deferred",
      expect.objectContaining({ reviewTokensAnonymized: false })
    );
  });

  // Scenario 12: reviews anonymize fails → flow continues
  it("continues when reviews anonymization fails", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      { data: [buildOrder({ payment_status: "paid", total_amount: 500 })], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    scripted.setResponses("reviews", [
      { data: null, error: { message: "reviews table failure" } },
    ]);

    const result = await executeDeletionRequest("req-1");

    expect(result.success).toBe(true);
    expect(mockLogError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        context: "execute_deletion_anonymize_reviews_failed",
      })
    );
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "deletion_request_deferred",
      expect.objectContaining({ reviewTextsAnonymized: false })
    );
  });

  // Scenario 13: unpaid delete fails → flow continues, unpaidDeleted=0
  it("continues when unpaid-orders delete fails (count stays 0)", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      {
        data: [
          buildOrder({ id: "o-paid", payment_status: "paid", total_amount: 500, created_at: "2026-01-01T00:00:00Z" }),
          buildOrder({ id: "o-unpaid", payment_status: "initiated", total_amount: 400 }),
        ],
        error: null,
      },
      { data: null, error: null }, // OTP
      { data: null, error: null }, // email/phone
      { data: null, error: null }, // address
      { data: null, error: { message: "FK violation" } }, // unpaid delete
    ]);

    const result = await executeDeletionRequest("req-1");

    expect(result.success).toBe(true);
    expect(result.ordersDeleted).toBe(0);
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "deletion_request_deferred",
      expect.objectContaining({ unpaidOrdersDeleted: 0 })
    );
  });

  // Scenario 15: deferred_legal payload includes retention_end_date and earliest_order_fy
  it("computes retention_end_date and earliest_order_fy from oldest paid order", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      {
        data: [
          buildOrder({ id: "o-old", payment_status: "paid", total_amount: 500, created_at: "2024-06-15T00:00:00Z" }),
          buildOrder({ id: "o-new", payment_status: "paid", total_amount: 700, created_at: "2025-09-01T00:00:00Z" }),
        ],
        error: null,
      },
    ]);

    await executeDeletionRequest("req-1");

    const deferredUpdate = findUpdate("deletion_requests", (p) => p.status === "deferred_legal");
    expect(deferredUpdate?.payload?.earliest_order_fy).toBe("2024-25");
    expect(deferredUpdate?.payload?.retention_end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "deletion_request_deferred",
      expect.objectContaining({ earliestOrderFy: "2024-25" })
    );
  });

  // Scenario 17: audit log reason captures the threshold split with counts
  it("audit log reason describes which orders were anonymized vs retained", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      {
        data: [
          buildOrder({ id: "o-low", payment_status: "paid", total_amount: 800, created_at: "2026-01-01T00:00:00Z" }),
          buildOrder({ id: "o-high", payment_status: "paid", total_amount: 90000, created_at: "2026-02-01T00:00:00Z" }),
        ],
        error: null,
      },
    ]);

    await executeDeletionRequest("req-1");

    expect(mockLogDataAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "orders",
        operation: "UPDATE",
        rowCount: 2,
        reason: expect.stringContaining("anonymized on 2 paid order(s)"),
      })
    );
    expect(mockLogDataAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: expect.stringContaining("anonymized on 1 order(s) below ₹50,000"),
      })
    );
    expect(mockLogDataAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: expect.stringContaining("1 order(s) at or above ₹50,000 retained full recipient PII"),
      })
    );
  });

  // Scenario 14: CASE 2 hard-delete fails → row stays pending for next-cycle retry (Option A)
  it("leaves CASE 2 failure at status 'pending' so cron retries next cycle", async () => {
    scripted.setResponses("deletion_requests", [
      { data: buildRequest(), error: null },
    ]);
    scripted.setResponses("orders", [
      { data: [buildOrder({ id: "o-1", payment_status: "initiated" })], error: null },
      { data: null, error: { message: "delete failed" } },
    ]);

    const result = await executeDeletionRequest("req-1");

    expect(result.success).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.message).toBe("Failed to delete order data");

    // No deletion_requests UPDATE writing 'failed' or 'completed' — row left untouched
    const drUpdates = scripted.calls.filter(
      (c) => c.table === "deletion_requests" && c.method === "update"
    );
    expect(drUpdates).toHaveLength(0);
  });

  // Scenario 18: deletion request not found / not eligible
  it("returns failure when deletion request is not found or not eligible", async () => {
    scripted.setResponses("deletion_requests", [
      { data: null, error: { message: "no rows" } },
    ]);

    const result = await executeDeletionRequest("nonexistent-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("Deletion request not found or not eligible for execution");
    expect(scripted.calls.filter((c) => c.table === "orders").length).toBe(0);
  });

  // Scenario 19: idempotency — re-running on a deferred_legal request returns "not found"
  it("treats deferred_legal as not eligible (idempotent re-run)", async () => {
    scripted.setResponses("deletion_requests", [
      { data: null, error: null },
    ]);

    const result = await executeDeletionRequest("req-1");

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(scripted.calls.filter((c) => c.table === "orders").length).toBe(0);
  });
});
