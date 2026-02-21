# Trisikha Organics — Security Audit Report

**Date**: 2026-02-21
**Scope**: Full-stack security review of the `selling` branch
**Status**: Initial audit complete — two bugs fixed, test coverage added

---

## Executive Summary

The platform has a solid security foundation: Razorpay payments use HMAC-SHA256 with
timing-safe comparison, Supabase Auth with RLS protects data at the database layer, CSRF
tokens guard all state-changing API routes, and rate limiting is in place on all critical
endpoints. Two concrete bugs were found and fixed during this audit. Several known residual
gaps are documented below with their accepted risk rationale.

---

## Confirmed Working Mechanisms

| Mechanism | Location | Notes |
|---|---|---|
| Payment signature verification | `app/api/payment/verify/route.ts` | HMAC-SHA256 + `timingSafeEqual` |
| Razorpay webhook signature | `app/api/webhooks/razorpay/verify/route.ts` | Webhook secret + timing-safe |
| Payment amount validation | `app/api/payment/verify/route.ts` | ±0.01 tolerance |
| Payment idempotency | `app/api/payment/verify/route.ts` | Conditional update on `payment_status = 'initiated'` |
| OTP generation (secure random) | `app/api/orders/send-cancel-otp/route.ts` | `crypto.randomInt` |
| OTP expiry (10 min) | `app/api/orders/cancel/route.ts` | Checked server-side |
| OTP attempt lockout | `app/api/orders/cancel/route.ts` | 3 strikes → 1-hour lock |
| CSRF protection | `lib/csrf.ts` | HMAC token; GET/HEAD/OPTIONS and webhooks exempt |
| XSS prevention | `lib/xss.ts` | `escapeHtml`, `sanitizeUrl`, `stripHtmlTags`, `sanitizeObject` |
| Rate limiting | `lib/rate-limit.ts` | Applied to checkout, payment, OTP, cancellation |
| RBAC | `lib/auth.ts` + Supabase RLS | Admin role enforced at DB level |
| RLS policies | Supabase migrations | Products public-read; all mutations require auth |
| Security headers | `next.config.ts` | `X-Frame-Options`, `X-Content-Type-Options`, CSP, Referrer-Policy |
| Structured logging | `lib/logger.ts` | Winston; no PII in log metadata |
| Security event tracking | `lib/logger.ts` → `trackSecurityEvent` | Anomaly detection + incident creation |
| IP blocking | `lib/ip-block.ts` (via middleware) | Permanent/temporary block |

---

## Bugs Fixed

### Bug 1 — OTP plain-text comparison (timing attack)

**File**: `app/api/orders/cancel/route.ts` (~line 147)
**Severity**: Medium

**Before**:
```ts
if (order.otp_code !== otp || new Date(order.otp_expires_at) < new Date())
```

**After**:
```ts
const otpMatch = order.otp_code
  ? crypto.timingSafeEqual(Buffer.from(order.otp_code), Buffer.from(otp))
  : false;
if (!otpMatch || new Date(order.otp_expires_at) < new Date())
```

The `!==` comparison leaks timing information that can help an attacker narrow down the
correct OTP by measuring response time differences. `timingSafeEqual` eliminates this channel.

---

### Bug 2 — `console.log` PII in get-order route

**File**: `app/api/orders/get-order/[order_id]/route.ts`
**Severity**: Low
**Status**: Already resolved in a prior commit — file is clean.

---

## Hardening Enhancement — `sanitizeUrl` domain allowlist

**File**: `lib/xss.ts`

The previous `sanitizeUrl` only blocked non-http(s) protocols but allowed any http/https
URL, including attacker-controlled tracking links or redirect targets.

The new implementation reads `ALLOWED_URL_DOMAINS` from the environment (comma-separated,
supports `*.wildcard` syntax) and **fails closed** — returning `""` when no domains are
configured. This prevents open-redirect / SSRF-style attacks if a URL from an external
service (e.g. Shiprocket tracking URL) is ever reflected to users.

**Required `.env` addition** (user must set manually):
```
ALLOWED_URL_DOMAINS=*.shiprocket.in,trisikha.com,localhost
```

---

## Test Coverage Added

| File | Type | What it covers |
|---|---|---|
| `tests/csrf.test.ts` | Unit | `generateCsrfToken`, `verifyCsrfToken`, `requireCsrf`, `validateCsrfRequest` |
| `tests/xss-prevention.test.ts` | Unit | `escapeHtml`, `sanitizeUrl` (protocols + domain allowlist + fail-closed), `stripHtmlTags`, `sanitizeObject` |
| `tests/payment-verify.test.ts` | Unit (handler import) | Gateway status (N), amount tolerance (O), DB idempotency (P) |
| `tests/api-security.test.ts` | Integration (fetch) | Headers (A), webhook sigs (B-C), input validation (D), CSRF wiring (E), OTP inputs (F), order ownership (G), admin auth (H), checkout (I), RLS (J-M) |

---

## Known Residual Gaps

### 1. CSP includes `unsafe-inline` and `unsafe-eval`

**Reason accepted**: Razorpay's checkout script requires both. Removing them would break
the payment flow. Mitigation: the CSP still whitelists specific `connect-src`, `frame-src`,
and `script-src` domains, limiting injection surface.

**Improvement path**: When Razorpay supports CSP nonces, adopt them and remove
`unsafe-eval`.

### 2. In-memory rate-limit fallback (no Redis)

**Context**: The rate limiter uses Upstash Redis in production. In environments where
`UPSTASH_REDIS_REST_URL` is not set, it falls back to an in-memory store. This means rate
limits are per-instance and do not persist across serverless restarts.

**Accepted for**: Development and staging.
**Production requirement**: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` must be
set before deploying to production.

### 3. Email via Gmail SMTP

**Context**: `nodemailer` uses Gmail SMTP with an app password. This is a single point of
failure (Google can revoke the token without notice) and does not support DMARC/DKIM
alignment out of the box.

**Recommendation**: Migrate to a transactional email service (SendGrid, AWS SES, Postmark)
before public launch. These services also provide delivery analytics and bounce handling.

### 4. No CAPTCHA on guest checkout or OTP request

**Context**: Guest checkout and OTP generation are rate-limited by IP but not protected by
CAPTCHA. Residential proxies can rotate IPs to bypass per-IP limits.

**Recommendation**: Add reCAPTCHA v3 (invisible) to the checkout and OTP request forms.

---

## Pre-Production Security Checklist

- [x] HTTPS enforced (Next.js HSTS header in `next.config.ts`)
- [x] Rate limiting on all critical endpoints
- [x] CSRF protection on all state-changing routes
- [x] Input validation (Zod schemas on all API routes)
- [x] RLS policies on all Supabase tables
- [x] Payment signature verification (HMAC-SHA256 + timing-safe)
- [x] OTP timing-safe comparison (`crypto.timingSafeEqual`)
- [x] Structured logging (Winston, no PII in log metadata)
- [x] Security headers (X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy)
- [ ] `ALLOWED_URL_DOMAINS` env var set in production
- [ ] `UPSTASH_REDIS_REST_URL` set in production
- [ ] Email service migrated from Gmail SMTP
- [ ] CAPTCHA on guest checkout and OTP endpoints
- [ ] SPF/DKIM/DMARC DNS records configured
- [ ] Dependency audit (`npm audit`) run and issues resolved
- [ ] PCI DSS SAQ-A completed (see `docs/PCI_DSS_SAQ_A.md`)

---

*Generated by security audit — 2026-02-21*
