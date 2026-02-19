# Security Verification Plan

## Context

The existing `tests/` directory has four Vitest unit-test files that test security *logic in isolation with mocks* — they never touch actual API routes and are missing CSRF, XSS, and RLS coverage entirely. This plan adds two new test files and fixes two concrete bugs found during the audit. A human-readable audit report is also saved to `docs/security-audit.md`.

---

## Audit Findings Summary

### Confirmed working ✅
| Mechanism | File | Detail |
|---|---|---|
| HMAC-SHA256 + `timingSafeEqual` webhook | `app/api/webhooks/razorpay/verify/route.ts` | Signature checked before any DB access |
| HMAC-SHA256 + `timingSafeEqual` refund webhook | `app/api/webhooks/razorpay/refund/route.ts` | `verifySignature()` with null-guard |
| HMAC-SHA256 + gateway double-check + amount match | `app/api/payment/verify/route.ts` | Three-layer payment validation |
| Idempotency (conditional DB update) | `app/api/payment/verify/route.ts:135` | `.eq("payment_status","initiated")` |
| Idempotency (webhook) | `app/api/webhooks/razorpay/verify/route.ts:83` | Same conditional update |
| Atomic stock decrement | `app/api/checkout/route.ts` | Supabase RPC + optimistic-lock fallback |
| Rate limiting (Upstash Redis) | `lib/rate-limit.ts` | Per-endpoint sliding windows |
| RBAC (`requireRole`) | `lib/auth.ts:64` | 403 on mismatch; applied to all admin/seller routes |
| Order ownership (`verifyOrderAccess`) | `lib/auth.ts:76` | Returns 404 (not 403) to prevent enumeration |
| OTP: `crypto.randomInt` + 10 min expiry + 3-attempt lockout | `app/api/orders/cancel/route.ts` | 1-hour lock after 3 failures |
| CSRF: HMAC-SHA256 double-submit cookie | `lib/csrf.ts` | Header `x-csrf-token` + cookie `csrf_token`; 24-hr expiry; `timingSafeEqual`; applied to all admin/seller POST routes; exempt on webhooks + GET |
| XSS: `escapeHtml`, `sanitizeUrl`, `stripHtmlTags`, `sanitizeObject` | `lib/xss.ts` | Recursive sanitizer on admin write routes; email templates use `lib/email.ts:escapeHtml` |
| Security headers | `next.config.ts` | HSTS, X-Frame-Options: DENY, X-Content-Type-Options, CSP, Referrer-Policy, Permissions-Policy |
| Zod input validation | `lib/validation.ts` | Checkout, OTP, cancel, payment verify, reviews |

### RLS policies — 24 tables

| Table | Public Read | Anon Write | Authenticated | Service Role |
|---|---|---|---|---|
| `products` | ✅ yes | ❌ blocked | admin only | full |
| `orders` | ❌ blocked | ❌ blocked | own rows + admin | full |
| `order_items` | ❌ blocked | ❌ blocked | own via order + admin | full |
| `user_role` | ❌ blocked | ❌ blocked | own row (read); admin all | full |
| `manifest_batches` | ❌ blocked | ❌ blocked | admin only | full |
| `audit_log` | ❌ blocked | ❌ blocked | admin read only | insert + read |
| `vendor_breach_log` | ❌ blocked | ❌ blocked | admin read only | full |
| `backup_log` | ❌ blocked | ❌ blocked | admin read only | full |
| `guest_data_sessions` | ❌ blocked | ❌ blocked | ❌ blocked | full |
| `uptime_log` | ❌ blocked | ❌ blocked | admin read only | full |
| `ip_blocklist` | ❌ blocked | ❌ blocked | admin read + update | insert + update |
| `ip_whitelist` | ❌ blocked | ❌ blocked | admin full | read |
| `ip_offense_history` | ❌ blocked | ❌ blocked | admin read only | insert + read |
| `deletion_requests` | ❌ blocked | ❌ blocked | admin read only | full |
| `correction_requests` | ❌ blocked | ❌ blocked | admin read + update | full |
| `grievances` | ❌ blocked | ❌ blocked | admin read + update | full |
| `incident_affected_users` | ❌ blocked | ❌ blocked | admin full | full |
| `nominees` | ❌ blocked | ❌ blocked | ❌ blocked | full |
| `nominee_claims` | ❌ blocked | ❌ blocked | ❌ blocked | full |
| `security_incidents` | ❌ blocked | ❌ blocked | admin read + update | insert |
| `reviews` | ✅ visible only | ❌ blocked | — | full |
| `review_tokens` | ❌ blocked | ❌ blocked | ❌ blocked | full |
| `review_helpful_votes` | ❌ blocked | ❌ blocked | ❌ blocked | full |
| `product_specifications` | ✅ yes | ❌ blocked | admin only | full |

### Bugs to fix 🐛
1. **OTP plain-text comparison** — `app/api/orders/cancel/route.ts:148`
   `order.otp_code !== otp` uses `!==`; should use `crypto.timingSafeEqual`.
2. **Debug `console.log()` leaking PII** — `app/api/orders/get-order/[order_id]/route.ts`
   Three `console.log()` calls print `order`, `guestEmail`, and `order.guest_email`.

---

## Implementation

### Step 1 — Fix OTP timing-safe comparison
**File:** `app/api/orders/cancel/route.ts` (~line 148)

```ts
// Before
if (order.otp_code !== otp || ...) {

// After
const otpMatch = order.otp_code
  ? crypto.timingSafeEqual(Buffer.from(order.otp_code), Buffer.from(otp))
  : false;
if (!otpMatch || ...) {
```

### Step 2 — Harden `sanitizeUrl` with domain allowlisting
**File:** `lib/xss.ts`

Add a new env var `ALLOWED_URL_DOMAINS` (comma-separated, supports `*.subdomain` wildcards).
`sanitizeUrl` fails **closed**: if the env var is missing or the domain doesn't match, return `""`.

```ts
// New env var: ALLOWED_URL_DOMAINS=*.shiprocket.in,trisikha.com,localhost
function getAllowedDomains(): Set<string> {
  const raw = process.env.ALLOWED_URL_DOMAINS || "";
  return new Set(raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean));
}

export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";

    const allowed = getAllowedDomains();
    if (allowed.size === 0) return ""; // fail closed — no domains configured

    const host = parsed.hostname.toLowerCase();
    const ok = [...allowed].some((d) =>
      d.startsWith("*.") ? host === d.slice(2) || host.endsWith("." + d.slice(2)) : host === d
    );
    return ok ? url : "";
  } catch {
    return "";
  }
}
```

**`.env` additions:**
```
ALLOWED_URL_DOMAINS=*.shiprocket.in,trisikha.com,localhost
```

### Step 3 — Remove debug console.logs
**File:** `app/api/orders/get-order/[order_id]/route.ts`
Delete the three `console.log()` lines that print `order`, `guestEmail`, `order.guest_email`.

### Step 3 — Write integration tests
**New file:** `tests/api-security.test.ts`

Uses `fetch()` against `BASE_URL` env var (default `http://localhost:3000`).
Tests skip gracefully if server is unreachable.

#### A. Security headers
- `X-Frame-Options: DENY` present
- `X-Content-Type-Options: nosniff` present
- `Strict-Transport-Security` present
- `Content-Security-Policy` contains `default-src 'self'`
- `Referrer-Policy` present

#### B. Webhook signature verification + idempotency (`POST /api/webhooks/razorpay/verify`)
> Requires `RAZORPAY_WEBHOOK_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` set in test env.

The endpoint computes `HMAC-SHA256(body, secret)` and compares with the `x-razorpay-signature` header via `timingSafeEqual`. Two rejection paths exist:
1. Header missing → `receivedSignature = ""` → 0-byte buffer vs 64-byte HMAC → `timingSafeEqual` throws → caught → 400
2. Header present but wrong → `timingSafeEqual` returns `false` → 400

**Signature rejection tests:**
- No `x-razorpay-signature` header → 400
- `x-razorpay-signature` set to a 64-char hex string that doesn't match the body's HMAC → 400

> "Tampered payload" is the same as "wrong HMAC" from the server's perspective — no separate test needed.

**Idempotency test** (skipped if `RAZORPAY_WEBHOOK_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` not set):

The response is always `200 { received: true }` regardless of whether the event was already processed, so idempotency can only be verified via DB state.

Test steps:
1. Use service role key to insert a test order: `payment_status = "initiated"`, `notes.order_id` = test UUID
2. Compute valid `x-razorpay-signature`: `HMAC-SHA256(body, RAZORPAY_WEBHOOK_SECRET)`
3. POST webhook payload with valid signature → both calls return `200`
4. POST the same payload + signature a second time → `200`
5. Query DB: `payment_status` must be `"paid"` (set on first call), `updated_at` must not have changed on second call (conditional update `.eq("payment_status","initiated")` skips it)
6. Clean up: delete test order via service role

#### C. Refund webhook signature (`POST /api/webhooks/razorpay/refund`)
> Requires `RAZORPAY_WEBHOOK_SECRET` set in test env.

- No `x-razorpay-signature` header → 400
- `x-razorpay-signature` set to wrong 64-char hex → 400

#### D. Payment verification input (`POST /api/payment/verify`)
- Missing `razorpay_signature` → 400 (Zod)
- Non-UUID `order_id` → 400 (Zod)
- Correctly structured but wrong HMAC → 400

#### E. CSRF protection (`POST /api/seller/products`)
- No `x-csrf-token` header → 403 "Invalid or missing CSRF token"
- Malformed token (wrong format, parts.length !== 3) → 403
- Expired token (timestamp > 24h ago, manually crafted) → 403
- GET request without CSRF header → not blocked (CSRF exempt for GET)
- POST to `/api/webhooks/razorpay/verify` without CSRF → not blocked (webhooks exempt)

#### F. OTP input validation (`POST /api/orders/send-cancel-otp`)
- Missing `orderId` → 400
- Non-UUID `orderId` → 400
- Invalid email format → 400

#### G. Order ownership (`GET /api/orders/get-order/[id]`)
- Random UUID, no auth, no email → 404
- Random UUID with wrong email query param → 404 (not 403)

#### H. Admin route protection (`GET /api/orders/get-new-orders`)
- No auth cookie → 401

#### I. Checkout stock/input validation (`POST /api/checkout`)
- Empty `cart_items` array → 400
- Malformed body (not JSON) → 400

> **Scope note**: Only `NEXT_PUBLIC_SUPABASE_ANON_KEY` is client-exposed. All tests below use it exclusively. `authenticated` and `service_role` access is server-side only and is not tested here.

The 24 tables break into two groups from the anon perspective:
- **Public read** (3 tables): `products`, `reviews` (visible only), `product_specifications`
- **Anon read blocked** (21 tables): everything else → returns `200 []`
- **Anon write blocked** (all 24 tables): no table allows anon INSERT / UPDATE / DELETE

All tests use `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

The full table list tested for every operation:

```
products, orders, order_items, user_role, manifest_batches, audit_log,
vendor_breach_log, backup_log, guest_data_sessions, uptime_log, ip_blocklist,
ip_whitelist, ip_offense_history, deletion_requests, correction_requests,
grievances, incident_affected_users, nominees, nominee_claims,
security_incidents, reviews, review_tokens, review_helpful_votes,
product_specifications
```

#### J. RLS — anon SELECT
- `products`, `product_specifications` → `200` with rows (public read ✅)
- `reviews?is_visible=eq.true` → `200` with rows (public visible reviews ✅)
- All other 21 tables → `200 []` (RLS silently filters, no data returned ✅)

#### K. RLS — anon INSERT blocked (all 24 tables)
`POST /rest/v1/{table}` with a minimal JSON body → `401` or `403` for every table.
Verifies that public read on `products`/`reviews`/`product_specifications` does NOT imply write access.

#### L. RLS — anon UPDATE blocked (all 24 tables)
`PATCH /rest/v1/{table}?id=eq.00000000-0000-0000-0000-000000000000` → `401` or `403` for every table.

#### M. RLS — anon DELETE blocked (all 24 tables)
`DELETE /rest/v1/{table}?id=eq.00000000-0000-0000-0000-000000000000` → `401` or `403` for every table.

### Step 4 — Write XSS unit tests
**New file:** `tests/xss-prevention.test.ts`

Pure unit tests against `lib/xss.ts` — no server needed.

**`escapeHtml`**
- `escapeHtml("<script>alert(1)</script>")` → `"&lt;script&gt;alert(1)&lt;/script&gt;"`
- `escapeHtml('<img src=x onerror=alert(1)>')` → fully escaped
- `escapeHtml('"double"')` → `"&quot;double&quot;"`
- `escapeHtml("'single'")` → `"&#039;single&#039;"`
- `escapeHtml(null)` → `""`
- `escapeHtml(undefined)` → `""`

**`sanitizeUrl` — protocol injection blocked**
Tests run with `ALLOWED_URL_DOMAINS=*.shiprocket.in,trisikha.com,localhost` set.

- `sanitizeUrl("javascript:alert(1)")` → `""` ✅
- `sanitizeUrl("data:text/html,<script>alert(1)</script>")` → `""` ✅
- `sanitizeUrl("vbscript:msgbox(1)")` → `""` ✅
- `sanitizeUrl("")` → `""` ✅
- `sanitizeUrl(null)` → `""` ✅

**`sanitizeUrl` — domain allowlist enforced**
- `sanitizeUrl("https://app.shiprocket.in/label/123")` → the URL (wildcard `*.shiprocket.in` matches ✅)
- `sanitizeUrl("https://trisikha.com/my-data?token=abc")` → the URL (exact match ✅)
- `sanitizeUrl("http://localhost:3000/cancel")` → the URL (dev domain ✅)
- `sanitizeUrl("http://evil-phishing.com")` → `""` (not in allowlist ✅)
- `sanitizeUrl("https://attacker.com/steal?data=x")` → `""` (not in allowlist ✅)
- `sanitizeUrl("https://notshiprocket.in/fake")` → `""` (subdomain mismatch ✅)

**`sanitizeUrl` — fails closed when env var missing**
- With `ALLOWED_URL_DOMAINS` unset: `sanitizeUrl("https://trisikha.com")` → `""` (no domains = deny all ✅)

**`stripHtmlTags`**
- `stripHtmlTags("<b>John</b>")` → `"John"`
- `stripHtmlTags("<script>alert(1)</script>text")` → `"alert(1)text"`
- `stripHtmlTags("<img src=x onerror=alert(1)/>")` → `""`
- `stripHtmlTags("")` → `""`

**`sanitizeObject`**
- `sanitizeObject({ name: "<b>bad</b>", email: "x@x.com" })` → name stripped, email untouched (in skip set)
- `sanitizeObject({ nested: { desc: "<script>x</script>" } })` → nested value stripped
- `sanitizeObject({ items: ["<b>ok</b>", "plain"] })` → array items stripped

### Step 5 — Save audit report
**New file:** `docs/security-audit.md`

Human-readable document listing all confirmed mechanisms, bugs fixed, and known remaining gaps (CSP `unsafe-inline`/`unsafe-eval`, in-memory rate-limit fallback on serverless without Redis).

---

## Files to Create/Modify

| File | Action |
|---|---|
| `lib/xss.ts` | Harden `sanitizeUrl` with `ALLOWED_URL_DOMAINS` domain allowlist |
| `app/api/orders/cancel/route.ts` | Fix OTP to use `timingSafeEqual` |
| `app/api/orders/get-order/[order_id]/route.ts` | Remove 3× debug `console.log()` |
| `.env` | Add `ALLOWED_URL_DOMAINS=*.shiprocket.in,trisikha.com,localhost` |
| `tests/api-security.test.ts` | New — HTTP integration tests (sections A–N) |
| `tests/xss-prevention.test.ts` | New — XSS unit tests |
| `docs/security-audit.md` | New — human-readable audit report |

---

## Running the Tests

```bash
# XSS unit tests only (no server needed)
npx vitest run tests/xss-prevention.test.ts

# Integration tests (requires dev server running)
npm run dev   # in one terminal
BASE_URL=http://localhost:3000 npx vitest run tests/api-security.test.ts

# Full suite
npm test
```
