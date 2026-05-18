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

function createScriptedSupabase() {
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
      if (method === "insert" || method === "update") {
        entry.payload = args[0] as Record<string, unknown>;
      }
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
    chain.delete = vi.fn(() => {
      record("delete", []);
      return chain;
    });
    chain.eq = vi.fn((col: string, val: unknown) => {
      record("eq", [col, val]);
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
    setResponses(table: string, responses: QueuedResponse[]) {
      queues[table] = [...responses];
    },
  };
}

let scripted = createScriptedSupabase();

vi.mock("@/utils/supabase/service", () => ({
  createServiceClient: vi.fn(() => scripted.supabase),
}));

const mockRateLimit = vi.fn().mockResolvedValue({ success: true });

vi.mock("@/lib/rate-limit", () => ({
  reviewSubmitRateLimit: { limit: (...args: unknown[]) => mockRateLimit(...args) },
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

const mockLogError = vi.fn();

vi.mock("@/lib/logger", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
}));

// Import AFTER mocks
import { POST } from "@/app/api/reviews/submit/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/reviews/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = () => ({
  token: "a".repeat(64),
  rating: 5,
  review_text: "Genuinely a great product to use daily.",
});

const futureExpiry = () =>
  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const pastExpiry = () =>
  new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const liveTokenRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "tok-1",
  order_id: "order-1",
  order_item_id: "oi-1",
  product_id: "prod-1",
  product_name: "Organic Manure 10kg",
  expires_at: futureExpiry(),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/reviews/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scripted = createScriptedSupabase();
    mockRateLimit.mockResolvedValue({ success: true });
  });

  it("happy path: inserts review, deletes token, returns 200", async () => {
    scripted.setResponses("review_tokens", [
      { data: liveTokenRow(), error: null },         // SELECT
      { data: null, error: null },                    // DELETE
    ]);
    scripted.setResponses("orders", [
      { data: { order_status: "DELIVERED", return_status: null }, error: null },
    ]);
    scripted.setResponses("reviews", [
      {
        data: {
          id: "rev-1",
          rating: 5,
          review_text: "Genuinely a great product to use daily.",
          created_at: new Date().toISOString(),
        },
        error: null,
      },
    ]);

    const res = await POST(makeRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.review).toMatchObject({ id: "rev-1", rating: 5 });

    // Token DELETE issued post-insert
    const deleteCall = scripted.calls.find(
      (c) => c.table === "review_tokens" && c.method === "delete"
    );
    expect(deleteCall).toBeDefined();
  });

  it("token not found → 400 with combined invalid/used message", async () => {
    scripted.setResponses("review_tokens", [
      { data: null, error: { message: "no rows", code: "PGRST116" } },
    ]);

    const res = await POST(makeRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/invalid or already-used/i);

    // No DELETE issued — there's nothing to delete
    expect(scripted.calls.filter((c) => c.method === "delete")).toHaveLength(0);
  });

  it("token expired → 400 expired", async () => {
    scripted.setResponses("review_tokens", [
      { data: liveTokenRow({ expires_at: pastExpiry() }), error: null },
    ]);

    const res = await POST(makeRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/expired/i);
  });

  it("order not delivered → 400 cannot submit", async () => {
    scripted.setResponses("review_tokens", [
      { data: liveTokenRow(), error: null },
    ]);
    scripted.setResponses("orders", [
      { data: { order_status: "SHIPPED", return_status: null }, error: null },
    ]);

    const res = await POST(makeRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/cannot be submitted/i);
  });

  it("duplicate review insert → 409", async () => {
    scripted.setResponses("review_tokens", [
      { data: liveTokenRow(), error: null },
    ]);
    scripted.setResponses("orders", [
      { data: { order_status: "DELIVERED", return_status: null }, error: null },
    ]);
    scripted.setResponses("reviews", [
      { data: null, error: { message: "dup", code: "23505" } },
    ]);

    const res = await POST(makeRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already reviewed/i);
  });

  it("generic insert failure → 500", async () => {
    scripted.setResponses("review_tokens", [
      { data: liveTokenRow(), error: null },
    ]);
    scripted.setResponses("orders", [
      { data: { order_status: "DELIVERED", return_status: null }, error: null },
    ]);
    scripted.setResponses("reviews", [
      { data: null, error: { message: "boom", code: "OTHER" } },
    ]);

    const res = await POST(makeRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/failed to submit/i);
    expect(mockLogError).toHaveBeenCalled();
  });

  it("token delete failure after successful insert → still returns 200, logs error", async () => {
    scripted.setResponses("review_tokens", [
      { data: liveTokenRow(), error: null },              // SELECT succeeds
      { data: null, error: { message: "fk error" } },     // DELETE fails
    ]);
    scripted.setResponses("orders", [
      { data: { order_status: "DELIVERED", return_status: null }, error: null },
    ]);
    scripted.setResponses("reviews", [
      {
        data: {
          id: "rev-1",
          rating: 5,
          review_text: "ok",
          created_at: new Date().toISOString(),
        },
        error: null,
      },
    ]);

    const res = await POST(makeRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tokenId: "tok-1" })
    );
  });

  it("rate limit hit → 429 before any DB query", async () => {
    mockRateLimit.mockResolvedValueOnce({ success: false });

    const res = await POST(makeRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toMatch(/too many requests/i);
    expect(scripted.calls).toHaveLength(0);
  });
});
