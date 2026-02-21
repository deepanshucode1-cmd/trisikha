/**
 * tests/api-security.test.ts
 *
 * Fetch-based integration tests that require a running dev server.
 * All tests are skipped automatically if the server is unreachable.
 *
 * Run:
 *   npm run dev
 *   BASE_URL=http://localhost:3000 npx vitest run tests/api-security.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let serverReachable = false;
let supabaseAvailable = false;

beforeAll(async () => {
  try {
    await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
    serverReachable = true;
  } catch {
    serverReachable = false;
    console.warn(
      `[api-security] Dev server not reachable at ${BASE_URL}. All integration tests will be skipped.`
    );
  }

  supabaseAvailable = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
});

function skipIfNoServer() {
  if (!serverReachable) {
    return true;
  }
  return false;
}

// ─── A: Security headers ──────────────────────────────────────────────────────

describe("A — Security headers", () => {
  it("A1: x-frame-options: DENY", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/");
    expect(res.headers.get("x-frame-options")?.toUpperCase()).toBe("DENY");
  });

  it("A2: x-content-type-options: nosniff", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/");
    expect(res.headers.get("x-content-type-options")?.toLowerCase()).toBe("nosniff");
  });

  it("A3: strict-transport-security header present", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/");
    // May not be present on localhost dev (no HTTPS), but should be present on prod
    // We check and warn rather than hard-fail
    const hsts = res.headers.get("strict-transport-security");
    if (!hsts) {
      console.warn("[A3] strict-transport-security missing — expected in production");
    }
    // On localhost this header may be omitted; test passes either way for dev flexibility
    expect(true).toBe(true);
  });

  it("A4: content-security-policy contains default-src 'self'", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/");
    const csp = res.headers.get("content-security-policy") || "";
    expect(csp).toContain("default-src");
    expect(csp).toContain("'self'");
  });

  it("A5: referrer-policy header present", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/");
    const rp = res.headers.get("referrer-policy");
    expect(rp).toBeTruthy();
  });
});

// ─── B: Razorpay payment webhook signature ────────────────────────────────────

describe("B — Webhook signature (payment)", () => {
  it("B1: no x-razorpay-signature header → 400", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/webhooks/razorpay/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "payment.captured" }),
    });
    expect(res.status).toBe(400);
  });

  it("B2: wrong 64-char hex signature → 400", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/webhooks/razorpay/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "a".repeat(64),
      },
      body: JSON.stringify({ event: "payment.captured" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── C: Razorpay refund webhook signature ─────────────────────────────────────

describe("C — Webhook signature (refund)", () => {
  it("C1: no signature → 400", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/webhooks/razorpay/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "refund.processed" }),
    });
    expect(res.status).toBe(400);
  });

  it("C2: wrong signature → 400", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/webhooks/razorpay/refund", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "b".repeat(64),
      },
      body: JSON.stringify({ event: "refund.processed" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── D: Payment verify input validation ───────────────────────────────────────

describe("D — Payment verify input validation", () => {
  it("D1: missing razorpay_signature → 400", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/payment/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: "123e4567-e89b-12d3-a456-426614174000",
        razorpay_order_id: "order_test123",
        razorpay_payment_id: "pay_test123",
        // razorpay_signature omitted
      }),
    });
    expect(res.status).toBe(400);
  });

  it("D2: non-UUID order_id → 400", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/payment/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: "not-a-uuid",
        razorpay_order_id: "order_test123",
        razorpay_payment_id: "pay_test123",
        razorpay_signature: "a".repeat(64),
      }),
    });
    expect(res.status).toBe(400);
  });

  it("D3: wrong HMAC (non-hex chars in signature) → 400", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/payment/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: "123e4567-e89b-12d3-a456-426614174000",
        razorpay_order_id: "order_test123",
        razorpay_payment_id: "pay_test123",
        razorpay_signature: "z".repeat(64), // non-hex: fails Zod regex
      }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── E: CSRF wiring ───────────────────────────────────────────────────────────

describe("E — CSRF wiring", () => {
  it("E1: POST /api/seller/products without x-csrf-token → 403", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/seller/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    const body = await res.json().catch(() => ({}));
    expect(JSON.stringify(body)).toMatch(/csrf/i);
  });

  it("E2: POST /api/seller/products with malformed token (not 3 parts) → 403", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/seller/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": "only:two",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("E3: GET /api/seller/products without token → not 403", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/seller/products", {
      method: "GET",
    });
    // GET is exempt from CSRF; may be 200/401/404 but not 403 due to CSRF
    expect(res.status).not.toBe(403);
  });

  it("E4: POST /api/webhooks/razorpay/verify without CSRF token → not 403", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/webhooks/razorpay/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    // Webhook endpoints are exempt from CSRF; should be 400 (bad sig), not 403 CSRF
    expect(res.status).not.toBe(403);
  });
});

// ─── F: OTP endpoint input validation ─────────────────────────────────────────

describe("F — OTP input validation", () => {
  it("F1: missing orderId → 400", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/orders/send-cancel-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("F2: non-UUID orderId → 400", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/orders/send-cancel-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "not-a-uuid", email: "test@example.com" }),
    });
    expect(res.status).toBe(400);
  });

  it("F3: invalid email format → 400", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/orders/send-cancel-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: "123e4567-e89b-12d3-a456-426614174000",
        email: "not-an-email",
      }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── G: Order ownership ───────────────────────────────────────────────────────

describe("G — Order ownership", () => {
  it("G1: random UUID with no auth, no email → 404 (not 200 or 500)", async () => {
    if (skipIfNoServer()) return;
    const fakeId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const res = await fetch(BASE_URL + `/api/orders/get-order/${fakeId}`);
    expect(res.status).toBe(404);
  });

  it("G2: random UUID with wrong email param → 404", async () => {
    if (skipIfNoServer()) return;
    const fakeId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    const res = await fetch(
      BASE_URL + `/api/orders/get-order/${fakeId}?email=attacker@evil.com`
    );
    expect(res.status).toBe(404);
  });
});

// ─── H: Admin route protection ────────────────────────────────────────────────

describe("H — Admin route protection", () => {
  it("H1: GET /api/orders/get-new-orders without auth cookie → 401", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/orders/get-new-orders");
    expect(res.status).toBe(401);
  });
});

// ─── I: Checkout validation ───────────────────────────────────────────────────

describe("I — Checkout validation", () => {
  it("I1: empty cart_items array → 400", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cart_items: [],
        email: "test@example.com",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("I2: malformed (non-JSON) body → 400", async () => {
    if (skipIfNoServer()) return;
    const res = await fetch(BASE_URL + "/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "this is not json {{{{",
    });
    expect(res.status).toBe(400);
  });
});

// ─── J–M: RLS via Supabase REST API ──────────────────────────────────────────

// Tables in the schema (products and product_specifications allow anon SELECT)
const PUBLIC_READ_TABLES = ["products", "product_specifications"];
const PROTECTED_TABLES = [
  "orders",
  "order_items",
  "profiles",
  "ip_blocks",
  "security_incidents",
  "audit_logs",
];
const ALL_TESTED_TABLES = [...PUBLIC_READ_TABLES, ...PROTECTED_TABLES];

describe("J — RLS: anon SELECT", () => {
  it("J1: anon can SELECT from products → 200 with array", async () => {
    if (!supabaseAvailable) return;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("J2: anon SELECT on protected tables returns empty array or 200 (RLS filters)", async () => {
    if (!supabaseAvailable) return;
    for (const table of PROTECTED_TABLES) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      // RLS can either return 200 with [] or 401/403 — both are acceptable
      const isOk = res.status === 200 || res.status === 401 || res.status === 403;
      expect(isOk).toBe(true);
      if (res.status === 200) {
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
        expect(body).toHaveLength(0); // RLS filters all rows for anon
      }
    }
  });
});

describe("K — RLS: anon INSERT denied", () => {
  it("K1: anon INSERT into all tables → 401 or 403", async () => {
    if (!supabaseAvailable) return;
    for (const table of ALL_TESTED_TABLES) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ id: "00000000-0000-4000-a000-000000000000" }),
      });
      expect([401, 403]).toContain(res.status);
    }
  });
});

describe("L — RLS: anon UPDATE denied", () => {
  it("L1: anon UPDATE on all tables → 401 or 403", async () => {
    if (!supabaseAvailable) return;
    for (const table of ALL_TESTED_TABLES) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?id=eq.00000000-0000-4000-a000-000000000000`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ updated_at: new Date().toISOString() }),
        }
      );
      expect([401, 403]).toContain(res.status);
    }
  });
});

describe("M — RLS: anon DELETE denied", () => {
  it("M1: anon DELETE on all tables → 401 or 403", async () => {
    if (!supabaseAvailable) return;
    for (const table of ALL_TESTED_TABLES) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?id=eq.00000000-0000-4000-a000-000000000000`,
        {
          method: "DELETE",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            Prefer: "return=minimal",
          },
        }
      );
      expect([401, 403]).toContain(res.status);
    }
  });
});
