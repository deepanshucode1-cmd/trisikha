# Remaining Audit Findings — Test Plan

Covers audit findings from **Atomic stock decrement** onward that are not addressed in
`docs/security-verification-plan.md` or `docs/stock-decrement-test-plan.md`.

| Already covered elsewhere | File |
|---|---|
| Atomic stock decrement | `docs/stock-decrement-test-plan.md` |
| Payment verify (gateway status, amount, idempotency) | `docs/security-verification-plan.md` §N–P |
| CSRF | `docs/security-verification-plan.md` §E |
| XSS unit tests | `docs/security-verification-plan.md` §Step 6 |
| Security headers | `docs/security-verification-plan.md` §A |
| Checkout input validation | `docs/security-verification-plan.md` §I |
| OTP / cancel input validation | `docs/security-verification-plan.md` §F |

**This file covers:**
- Rate limiting (per-endpoint)
- RBAC — `requireRole` and manual-check admin routes
- Order ownership — `verifyOrderAccess`
- OTP business logic — `send-cancel-otp` and `cancel`
- Refund lock idempotency — `cancel`
- Zod validation for remaining schemas (`cancelOrderSchema`, `productSchema`, `reviewSubmitSchema`)

**Test files produced:** `tests/rate-limit.test.ts`, `tests/rbac.test.ts`,
`tests/order-ownership.test.ts`, `tests/otp-cancel.test.ts`, `tests/validation.test.ts`

All use **direct handler import + `vi.mock()`** unless stated otherwise.

---

## Bugs found during analysis

### Bug A — `console.log()` PII leak in `verifyOrderAccess`
**File:** `lib/auth.ts:88, 113–114`

Three `console.log()` calls print `order` (containing `user_id` and `guest_email`)
and `guestEmail` to stdout. Same class as the bug already planned in `get-order` route.
Fix: delete all three lines.

### Bug B — `/api/seller/shiprocket/estimate-shipping` has no auth
**File:** `app/api/seller/shiprocket/estimate-shipping/route.ts`

Every other seller/admin route calls `requireRole("admin")`. This one does not.
It calls the Shiprocket API with server credentials, burning API quota for any caller.

### Bug C — Inconsistent admin auth pattern
Eleven routes use `requireRole("admin")`. Twenty-one routes use manual `supabase.auth.getUser()`
followed by a role check against the `user_role` table, many accepting `"super_admin"` in
addition to `"admin"`. If `"super_admin"` is not a valid role in the system, these routes
silently accept a role string that can never be assigned — the wider allow-list provides no
real value and creates confusion about what the actual role model is.

### Bug D — OTP plain-text comparison (already planned, repeated here for traceability)
**File:** `app/api/orders/cancel/route.ts:148`
`order.otp_code !== otp` uses `!==` instead of `crypto.timingSafeEqual`.
Fix is in `docs/security-verification-plan.md` Step 1.

---

## Section 1 — Rate limiting
**Test file:** `tests/rate-limit.test.ts`
**Method:** HTTP (`fetch → localhost:3000`) — rate limiting depends on the actual middleware
stack and cannot be meaningfully tested via direct handler import.

> Requires dev server running (`npm run dev`). Tests skip if server is unreachable.
> In-memory fallback is active when `UPSTASH_REDIS_REST_URL` is not set; tests still verify
> the 429 response shape even if the window resets between test runs.

### How to trigger the limit in tests

Each limiter has a sliding window. Tests exhaust the limit by firing `n + 1` requests in
a tight loop, where `n` is the window maximum. The final request must return 429 with the
correct headers.

### Per-endpoint cases

#### 1A. `/api/orders/send-cancel-otp` — `otpRateLimit` (3 / 10 min)
- 3 requests with a random non-existent orderId → all return 404 (order not found — limit not yet hit)
- 4th request → 429
- Response must include `X-RateLimit-Limit: 3`, `X-RateLimit-Remaining: 0`, `X-RateLimit-Reset: <ISO>`

#### 1B. `/api/orders/cancel` — `cancelOrderRateLimit` (5 / 1 hr)
- 5 requests with a malformed body → all return 400 (Zod — limit not yet hit)
- 6th request → 429
- Response headers checked as above

#### 1C. `/api/checkout` — `checkoutRateLimit` (10 / 1 hr)
- 10 requests with empty `cart_items` → all return 400
- 11th request → 429

#### 1D. `/api/payment/verify` — `paymentRateLimit` (30 / 1 hr)
- 30 requests with missing `razorpay_signature` → all return 400
- 31st request → 429

#### 1E. `/api/seller/shiprocket/estimate-shipping` — `shippingEstimateRateLimit` (20 / 1 min)
- 20 requests → all proceed (may error from Shiprocket, but not rate-limited)
- 21st request → 429
- Also verify: no auth header required (Bug B documented above)

#### 1F. Rate limit identifiers are IP-based
- Two requests from different spoofed `X-Forwarded-For` values that are valid IPs count
  against different buckets — neither hits the limit when the other is exhausted
- One request with an invalid `X-Forwarded-For` (injection payload) uses `"unknown"` as
  identifier — verify `sanitizeIp` returns `"unknown"` and the request is not rejected

---

## Section 2 — RBAC
**Test file:** `tests/rbac.test.ts`
**Method:** Direct handler import + `vi.mock()`

Mocks: `lib/auth` (`requireAuth`, `getUserProfile`), `utils/supabase/server`,
`utils/supabase/service`.

### 2A. Routes using `requireRole("admin")`

Representative set covers the two failure modes and one success case. The same assertions
apply to all routes in the list — testing every route individually would be redundant.

**Routes under test (representative):**
- `POST /api/seller/products`
- `POST /api/seller/shiprocket/assign-awb`
- `POST /api/seller/shiprocket/schedule-pickup`
- `POST /api/seller/shiprocket/generate-label`
- `POST /api/seller/shiprocket/generate-manifest-batch`
- `POST /api/admin/account/lock`
- `GET /api/admin/reviews`

| # | Scenario | Mock: `requireAuth` | Mock: `getUserProfile` | Expected |
|---|---|---|---|---|
| 2A-1 | No auth | throws `AuthError(401)` | not called | 401 |
| 2A-2 | Auth OK, role = `"customer"` | returns `{ user }` | returns `{ role: "customer" }` | 403 "Forbidden" |
| 2A-3 | Auth OK, role = `"admin"`, account locked | throws `AuthError(403, "Account locked...")` | not called | 403 |
| 2A-4 | Auth OK, role = `"admin"` | returns `{ user }` | returns `{ role: "admin" }` | passes to handler logic |

For 2A-4 the handler proceeds past auth; mock remaining dependencies minimally to get a
non-500 response confirming auth was accepted.

### 2B. Routes using manual auth checks (admin + super_admin)

**Routes under test (representative):**
- `GET /api/admin/corrections`
- `POST /api/admin/deletion-requests/bulk-execute`
- `GET /api/admin/grievances`
- `POST /api/admin/incidents/[id]/affected-users/notify`

These routes do not use `requireRole` — they call `supabase.auth.getUser()` and then
query the `user_role` table directly. Mock the Supabase server client.

| # | Scenario | Mock: `getUser` | Mock: `user_role` query | Expected |
|---|---|---|---|---|
| 2B-1 | No session | returns `{ user: null }` | not called | 401 |
| 2B-2 | Session, role = `"customer"` | returns `{ user: { id: "x" } }` | returns `{ role: "customer" }` | 401 or 403 |
| 2B-3 | Session, role = `"admin"` | returns `{ user: { id: "x" } }` | returns `{ role: "admin" }` | passes |
| 2B-4 | Session, role = `"super_admin"` | returns `{ user: { id: "x" } }` | returns `{ role: "super_admin" }` | passes (if accepted) |

2B-4 documents the current behaviour — `"super_admin"` is accepted by these routes.
If the role does not exist in the system, this represents dead allow-list surface (Bug C).

### 2C. `/api/seller/shiprocket/estimate-shipping` — no auth (Bug B)
- Request with no `Authorization` header → handler proceeds (no 401)
- This test intentionally documents the **missing auth** and should be marked
  `it.fails` or annotated as a known gap until Bug B is fixed

---

## Section 3 — Order ownership (`verifyOrderAccess`)
**Test file:** `tests/order-ownership.test.ts`
**Method:** Direct handler import + `vi.mock()`

`verifyOrderAccess` is called by `get-order`, `get-order-detail`, and potentially the
track route. Tests import `verifyOrderAccess` directly from `lib/auth` and unit-test it
in isolation, then verify it is called correctly by the routes.

Mocks: `utils/supabase/service` (orders query), `utils/supabase/server` (user session).

### 3A. Unit tests for `verifyOrderAccess`

| # | Scenario | order in DB | caller | Expected |
|---|---|---|---|---|
| 3A-1 | Order not found | `null` | any | throws `AuthError(404)` |
| 3A-2 | Authenticated user owns order | `{ user_id: "uid-1" }` | `user.id = "uid-1"` | returns order |
| 3A-3 | Authenticated admin | `{ user_id: "uid-other" }` | `user.id = "admin-1"`, role = `"admin"` | returns order |
| 3A-4 | Authenticated user, not owner | `{ user_id: "uid-other" }` | `user.id = "uid-1"` | throws `AuthError(404)` — not 403 |
| 3A-5 | Guest with matching email | `{ guest_email: "x@x.com" }` | unauthenticated, `guestEmail = "x@x.com"` | returns order |
| 3A-6 | Guest with wrong email | `{ guest_email: "x@x.com" }` | unauthenticated, `guestEmail = "y@y.com"` | throws `AuthError(404)` |
| 3A-7 | No auth and no guest email | `{ user_id: "uid-1" }` | neither | throws `AuthError(404)` |

**Verify 3A-4 and 3A-6 return 404, not 403** — enumeration prevention is the explicit
design goal (`lib/auth.ts:116` comment: "Don't reveal order exists").

### 3B. `console.log` leak (Bug A)

- Call `verifyOrderAccess` with a valid guest email scenario
- Assert that `console.log` was **not** called (spy on `console.log`)
- Currently **fails** — lines 88 and 113–114 in `lib/auth.ts` log `order` and
  `guestEmail`; fix is to delete those three lines

### 3C. Route-level ownership check — `GET /api/orders/get-order/[order_id]`

| # | Scenario | Expected |
|---|---|---|
| 3C-1 | Random UUID, no auth, no email query param | 404 |
| 3C-2 | Valid order UUID, wrong guest email | 404 |
| 3C-3 | Valid order UUID, correct guest email | 200 with order data |
| 3C-4 | Valid order UUID, authenticated owner | 200 |
| 3C-5 | Valid order UUID, authenticated non-owner | 404 |

---

## Section 4 — OTP: `send-cancel-otp`
**Test file:** `tests/otp-cancel.test.ts`
**Route:** `POST /api/orders/send-cancel-otp`
**Method:** Direct handler import + `vi.mock()`

Mocks: `utils/supabase/service`, `nodemailer`, `utils/shiprocket` (for return rate).

### 4A. Input validation (Zod — `otpRequestSchema`)
- Missing `orderId` → 400
- Non-UUID `orderId` → 400
- Invalid email format → 400
- Valid phone format accepted (`emailOrPhone` field)

### 4B. Order lookup
| # | Scenario | Expected |
|---|---|---|
| 4B-1 | Order not found | 404 "Order not found" |
| 4B-2 | Order found, email matches | proceeds |
| 4B-3 | Order found, email does not match | 403 "Email does not match order" |

### 4C. OTP lockout check
| # | Scenario | Expected |
|---|---|---|
| 4C-1 | `otp_locked_until` is null | proceeds |
| 4C-2 | `otp_locked_until` in the past | proceeds (lock expired) |
| 4C-3 | `otp_locked_until` in the future | 429 with `lockedUntil` in body |

### 4D. OTP generation correctness
- `crypto.randomInt` produces a 6-digit number (100000–999999) — verify by inspecting
  what is written to the DB mock: `otp_code` must match `/^[0-9]{6}$/`
- `otp_expires_at` must be approximately 10 minutes from now (within ±5 seconds)
- `otp_attempts` reset to 0, `otp_locked_until` reset to null on every new OTP issue
- `cancellation_status` set to `"OTP_SENT"`

### 4E. Return vs cancellation path
| # | Scenario | `order_status` | Expected response |
|---|---|---|---|
| 4E-1 | Cancellation | `"CONFIRMED"` | `{ success: true, expiresAt }` — no return fields |
| 4E-2 | Return (DELIVERED) | `"DELIVERED"` | `{ success: true, isReturn: true, estimatedRefund, ... }` |
| 4E-3 | Return (PICKED_UP) | `"PICKED_UP"` | same as 4E-2 |
| 4E-4 | Return, Shiprocket rate API fails | `"DELIVERED"` | falls back to `returnShippingCost = 80` |

---

## Section 5 — OTP: `cancel` route — OTP verification layer
**Test file:** `tests/otp-cancel.test.ts` (same file, separate `describe` block)
**Route:** `POST /api/orders/cancel`
**Method:** Direct handler import + `vi.mock()`

Mocks: `utils/supabase/service`, `razorpay`, `utils/shiprocket`, `nodemailer`,
`lib/creditNote`, `lib/email`.

### 5A. Input validation (Zod — `cancelOrderSchema`)
- Missing `orderId` → 400
- Non-UUID `orderId` → 400
- `otp` not 6 digits → 400
- `reason` under 10 chars → 400

### 5B. Order state guards (before OTP check)
| # | `order` state | Expected |
|---|---|---|
| 5B-1 | Order not found | 400 "Invalid order" |
| 5B-2 | `cancellation_status = null` | 400 "Cancellation not initiated" |
| 5B-3 | `cancellation_status = "CANCELLED"` | 200 "Order already cancelled" (idempotent) |
| 5B-4 | `order_status = "CHECKED_OUT"` | 400 "Order not confirmed yet" |
| 5B-5 | `order_status = "CANCELLED"` | 200 "Order already cancelled" |
| 5B-6 | `order_status = "SHIPPED"` | 200/400 "Shipped orders cannot be cancelled" |
| 5B-7 | `refund_status = "REFUND_INITIATED"` | 200 "Refund already in process" |
| 5B-8 | `refund_status = "REFUND_COMPLETED"` | 200 "Order already refunded" |

### 5C. OTP lockout check
| # | Scenario | Expected |
|---|---|---|
| 5C-1 | `otp_locked_until` null | proceeds to OTP verify |
| 5C-2 | `otp_locked_until` in future | 429 with `lockedUntil` |

### 5D. OTP verification correctness

> **Bug D context**: `order.otp_code !== otp` uses plain `!==`. The fix (timingSafeEqual)
> is in Step 1 of `security-verification-plan.md`. These tests verify behaviour both before
> and after the fix.

| # | Scenario | Expected |
|---|---|---|
| 5D-1 | Correct OTP, not expired | passes OTP layer, proceeds to cancellation |
| 5D-2 | Wrong OTP, attempts = 0 | 400 "Invalid OTP"; `otp_attempts` incremented to 1 |
| 5D-3 | Wrong OTP, attempts = 1 | 400; `otp_attempts` → 2 |
| 5D-4 | Wrong OTP, attempts = 2 (3rd failure) | 429; `otp_locked_until` set to 1 hour from now; `otp_attempts` → 3 |
| 5D-5 | Correct OTP but expired | 400 "OTP expired"; attempts incremented |
| 5D-6 | Correct OTP, already locked | 429 (lock check runs before OTP check) |

For 5D-4: verify the DB update sets `otp_locked_until ≈ now + 3600s` (within ±5s).
For 5D-2 through 5D-4: verify `otp_attempts` is written with the correct incremented value.

### 5E. 48-hour return window
| # | `order_status` | `delivered_at` | Expected |
|---|---|---|---|
| 5E-1 | `"DELIVERED"` | 47 hours ago | return eligible — proceeds |
| 5E-2 | `"DELIVERED"` | 49 hours ago | 400 "Return window expired" |
| 5E-3 | `"PICKED_UP"` | any | return eligible — no time limit |

### 5F. Refund lock idempotency
The refund initiation step uses:
```sql
UPDATE orders SET refund_status = 'REFUND_INITIATED'
WHERE id = $1 AND refund_status IS NULL AND payment_status = 'paid'
```

| # | Scenario | Mock: update result | Expected |
|---|---|---|---|
| 5F-1 | Normal path | 1 row updated | proceeds to Razorpay refund |
| 5F-2 | `refund_status` already set (duplicate call) | 0 rows updated | 400 "Unable to initiate refund" |
| 5F-3 | `payment_status` not `"paid"` | 0 rows updated | 400 — order never paid, cannot refund |

5F-2 is the idempotency test — concurrent duplicate cancellation calls can only result
in one refund being initiated.

### 5G. Refund processing path
| # | Scenario | Expected |
|---|---|---|
| 5G-1 | `shiprocket_status = "NOT_SHIPPED"` | Razorpay refund called; order marked CANCELLED |
| 5G-2 | `shiprocket_status = "SHIPPING_CANCELLED"` | Razorpay refund called |
| 5G-3 | `shiprocket_status = "AWB_ASSIGNED"` | Shiprocket cancel called first, then Razorpay refund |
| 5G-4 | Razorpay refund throws | `refund_status = "REFUND_FAILED"` written; 500 returned |
| 5G-5 | Razorpay refund result `status != "processed"` | no DB update to CANCELLED; handler falls through to safe-state response |

---

## Section 6 — Zod validation (remaining schemas)
**Test file:** `tests/validation.test.ts`
**Method:** Pure unit tests — import schema and call `.parse()` / `.safeParse()` directly.
No mocks needed.

### 6A. `cancelOrderSchema`
- `orderId`: non-UUID → fail; valid UUID → pass
- `otp`: 5 digits → fail; 7 digits → fail; non-numeric → fail; exactly 6 digits → pass
- `reason`: 9 chars → fail; 501 chars → fail; 10 chars → pass; omitted → pass (optional)

### 6B. `productSchema`
- `sku`: lowercase → fail (must be uppercase + digits + hyphens); `"ORG-001"` → pass
- `hsn`: 3 digits → fail; 9 digits → fail; `"3101"` (4 digits) → pass; `"31011000"` (8 digits) → pass
- `price`: negative → fail; zero → fail; positive → pass
- `weight`, `length`, `breadth`, `height`: zero → fail; negative → fail; above max → fail
- `description`: 49 chars → fail; 50 chars → pass; 2001 chars → fail

### 6C. `reviewSubmitSchema`
- `token`: not 64-char hex → fail; valid 64-char hex → pass
- `rating`: 0 → fail; 6 → fail; 1–5 → pass
- `review_text`: 9 chars → fail; 1001 chars → fail; empty string `""` → transforms to `undefined` (pass); omitted → pass
- `review_text`: exactly 10 chars → pass; 1000 chars → pass

### 6D. `addressSchema`
- `first_name`: empty → fail; contains `<script>` → fail (regex rejects `<`); `"John"` → pass
- `pincode`: 5 digits → fail; 7 digits → fail; non-numeric → fail; `"382721"` → pass
- `address_line2`: omitted → defaults to `""`

---

## Bugs to fix (additions to implementation plan)

| Bug | File | Fix |
|---|---|---|
| Bug A — `console.log` PII in `verifyOrderAccess` | `lib/auth.ts:88, 113–114` | Delete three `console.log` calls |
| Bug B — No auth on estimate-shipping | `app/api/seller/shiprocket/estimate-shipping/route.ts` | Add `requireRole("admin")` |
| Bug C — Inconsistent admin role patterns | Multiple admin routes | Audit: confirm `"super_admin"` is a real role or remove from allow-lists; standardise on `requireRole` |
| Bug D — OTP plain-text comparison | `app/api/orders/cancel/route.ts:148` | Already in Step 1 of `security-verification-plan.md` |

---

## Mock strategy

Same pattern as `tests/payment-verify.test.ts` throughout: module-level `vi.fn()` instances,
single `vi.mock()` factory per dependency, `beforeEach` reset, per-test `.mockResolvedValue()`.

Key mocks per test file:

**`tests/rbac.test.ts`**
```ts
vi.mock("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
  getUserProfile: mockGetUserProfile,
  requireRole: vi.fn().mockImplementation(async (role) => {
    const { user } = await mockRequireAuth();
    const profile = await mockGetUserProfile(user.id);
    if (profile.role !== role) throw new AuthError(403, "Forbidden");
    return { user, profile };
  }),
}));
```

**`tests/otp-cancel.test.ts`**
```ts
// Supabase: table-aware dispatcher (see payment-verify.test.ts pattern)
// Two separate describe blocks: one for send-cancel-otp, one for cancel
// nodemailer mocked to no-op
// razorpay.payments.refund mocked per scenario
// crypto.randomInt: vi.spyOn(crypto, "randomInt") to control OTP value in 4D
```

**`tests/order-ownership.test.ts`**
```ts
// Import verifyOrderAccess directly from lib/auth
// Mock only utils/supabase/service (orders query + user_role query)
// Spy on console.log to assert absence in Bug A test
```

---

## Files to create/modify

| File | Action |
|---|---|
| `lib/auth.ts` | Remove 3× `console.log()` at lines 88, 113–114 (Bug A) |
| `app/api/seller/shiprocket/estimate-shipping/route.ts` | Add `requireRole("admin")` (Bug B) |
| `tests/rate-limit.test.ts` | New — HTTP integration, per-endpoint rate limit exhaustion |
| `tests/rbac.test.ts` | New — RBAC direct handler tests |
| `tests/order-ownership.test.ts` | New — `verifyOrderAccess` unit + route integration |
| `tests/otp-cancel.test.ts` | New — OTP generation + cancel business logic |
| `tests/validation.test.ts` | New — remaining Zod schema unit tests |
