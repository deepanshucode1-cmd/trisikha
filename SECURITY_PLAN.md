# Trisikha Security Implementation Plan

## Overview

This document tracks the security hardening work for the Trisikha e-commerce platform. The goal is to secure all API endpoints, implement proper authorization, and protect against common vulnerabilities.

---

## Phase 1: Core Security Infrastructure [COMPLETED]

### 1.1 Security Libraries Created

| File | Purpose | Status |
|------|---------|--------|
| `lib/rate-limit.ts` | IP-based rate limiting (Upstash Redis + in-memory fallback) | Done |
| `lib/validation.ts` | Zod schemas for input validation | Done |
| `lib/logger.ts` | Winston logging with daily rotation | Done |
| `lib/errors.ts` | Centralized error handling with sanitization | Done |
| `lib/auth.ts` | Auth helpers, role checks, order access verification | Done |
| `utils/supabase/service.ts` | Service role client for bypassing RLS | Done |

### 1.2 Security Headers (next.config.ts) [COMPLETED]

- Content-Security-Policy (CSP)
- Strict-Transport-Security (HSTS)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection
- Referrer-Policy
- Permissions-Policy

### 1.3 Database Security [COMPLETED]

**Migrations Applied:**
- `20260107120000_otp_security.sql` - OTP attempt tracking columns
- `20260107120100_enable_rls.sql` - Row Level Security policies

**RLS Policies:**
- Products: Public read, admin-only write
- Orders: User sees own, admins see all, service role for guest ops
- Order Items: Access tied to parent order
- User Roles: Users see own, admins manage all

---

## Phase 2: API Route Security [COMPLETED]

### Guest-Facing Routes (Use Service Client)

| Route | Rate Limit | Validation | Auth | Logging | Status |
|-------|------------|------------|------|---------|--------|
| `/api/checkout` | 10/hour | checkoutSchema | None (guest) | Yes | Done |
| `/api/payment/verify` | 30/hour | paymentVerifySchema | Signature + amount | Yes | Done |
| `/api/orders/send-cancel-otp` | 3/10min | otpRequestSchema | Email match | Yes | Done |
| `/api/orders/cancel` | 5/hour | cancelOrderSchema | OTP + lockout | Yes | Done |
| `/api/track` | 60/min | trackOrderSchema | Optional email | Yes | Done |
| `/api/orders/get-order/[order_id]` | - | UUID | Email/user/admin | Yes | Done |
| `/api/orders/get-order-detail/[id]` | - | UUID | Email/user/admin | Yes | Done |
| `/api/products` | - | - | Public read | Yes | Done |

### Admin Routes (Require Authentication)

| Route | Auth | Logging | Status |
|-------|------|---------|--------|
| `/api/orders/get-new-orders` | Admin role | Yes | Done |
| `/api/orders/get-cancellation-failed` | Admin role | Yes | Done |
| `/api/orders/cancel/retry` | Admin role | Yes | Done |
| `/api/seller/products` (GET) | Admin role | Yes | Done |
| `/api/seller/products` (POST) | Admin role + validation | Yes | Done |

---

## Phase 3: Remaining Work [PENDING]

### 3.1 High Priority

| Task | Description | Status |
|------|-------------|--------|
| Shiprocket routes security | Add auth, validation, logging to `/api/seller/shiprocket/*` | Pending |
| Webhook security | Verify signatures on `/api/webhooks/razorpay/*` and `/api/webhooks/shiprocket` | Pending |
| CSRF protection | Add CSRF tokens for state-changing operations | Pending |
| Fix TypeScript errors | Clean up `any` types in shiprocket/webhook routes | Pending |

### 3.2 Medium Priority

| Task | Description | Status |
|------|-------------|--------|
| Email service migration | Move from Gmail SMTP to dedicated service (SendGrid/SES) | Pending |
| Guest checkout CAPTCHA | Add CAPTCHA to prevent automated abuse | Pending |
| Monitoring & alerts | Set up Sentry/Datadog for error tracking | Pending |
| Security audit | Run npm audit and fix vulnerabilities | Pending |

### 3.3 Low Priority

| Task | Description | Status |
|------|-------------|--------|
| Privacy policy page | GDPR compliance | Pending |
| Data export API | User data portability | Pending |
| Cookie consent | GDPR compliance | Pending |
| Penetration testing | External security audit | Pending |

---

## Architecture Decisions

### Why Service Role Client for Guest Operations?

The app supports guest checkout (no login required). RLS policies primarily protect authenticated users. For guest operations, we:

1. Use `createServiceClient()` to bypass RLS
2. Implement security at the API level:
   - Rate limiting (IP-based)
   - Input validation (Zod schemas)
   - Email verification for order access
   - OTP verification for cancellations
   - Logging for audit trails

### Security Layers

```
┌─────────────────────────────────────────┐
│  Layer 1: Security Headers (CSP, HSTS)  │
├─────────────────────────────────────────┤
│  Layer 2: Rate Limiting (per IP/action) │
├─────────────────────────────────────────┤
│  Layer 3: Input Validation (Zod)        │
├─────────────────────────────────────────┤
│  Layer 4: Authentication/Authorization  │
│  - Admin routes: requireRole("admin")   │
│  - Guest routes: email/OTP verification │
├─────────────────────────────────────────┤
│  Layer 5: RLS (Database level)          │
│  - Protects direct DB access            │
│  - Bypassed by service role for APIs    │
├─────────────────────────────────────────┤
│  Layer 6: Logging & Monitoring          │
└─────────────────────────────────────────┘
```

---

## Environment Variables Required

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # CRITICAL: Never expose to client

# Rate Limiting (optional - falls back to in-memory)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Razorpay
RAZORPAY_KEY_ID=rzp_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx

# Email
EMAIL_USER=xxx@gmail.com
EMAIL_PASS=xxx  # App password, not regular password

# Shiprocket
SHIPROCKET_EMAIL=xxx
SHIPROCKET_PASSWORD=xxx
STORE_PINCODE=382721
```

---

## Testing Checklist

### Security Tests to Run

- [ ] Guest checkout flow works end-to-end
- [ ] Rate limiting blocks excessive requests
- [ ] OTP lockout works after 3 failed attempts
- [ ] Admin routes reject non-admin users
- [ ] Order access requires valid email for guests
- [ ] Payment signature verification rejects invalid signatures
- [ ] Input validation rejects malformed data
- [ ] Error messages don't leak sensitive info in production

### Manual Security Checks

- [ ] Run `npm audit` and fix vulnerabilities
- [ ] Check for exposed secrets in git history
- [ ] Verify HTTPS is enforced in production
- [ ] Test CORS configuration
- [ ] Verify webhook secrets are configured

---

## Compliance Checklist

### PCI DSS (Payment Card Industry Data Security Standard)

| Requirement | Description | Status |
|-------------|-------------|--------|
| No card storage | Card data handled entirely by Razorpay | Done |
| HTTPS everywhere | TLS/SSL for all payment pages | Done |
| Signature verification | HMAC-SHA256 webhook validation | Done |
| Access controls | Admin-only access to payment data | Done |
| Audit logging | Payment events logged | Done |
| Amount validation | Server-side payment amount verification | Done |
| [ ] PCI SAQ-A | Complete Self-Assessment Questionnaire | Pending |
| [ ] Quarterly scans | ASV vulnerability scans | Pending |

### GDPR (General Data Protection Regulation)

| Requirement | Description | Status |
|-------------|-------------|--------|
| [ ] Privacy Policy | Clear privacy policy page | Pending |
| [ ] Cookie Consent | Cookie banner with opt-in/opt-out | Pending |
| [ ] Data Minimization | Only collect necessary data | Partial |
| [ ] Right to Access | User data export API (`/api/user/export`) | Pending |
| [ ] Right to Erasure | User data deletion API (`/api/user/delete`) | Pending |
| [ ] Data Portability | Export data in machine-readable format | Pending |
| [ ] Breach Notification | Process for notifying users within 72 hours | Pending |
| [ ] DPA with Supabase | Data Processing Agreement | Pending |
| [ ] DPA with Razorpay | Data Processing Agreement | Pending |
| [ ] Consent Records | Log user consent for marketing | Pending |

### India IT Act & DPDP Act (Digital Personal Data Protection)

| Requirement | Description | Status |
|-------------|-------------|--------|
| [ ] Data Localization | Verify data storage location (Supabase region) | Pending |
| [ ] Consent Management | Clear consent for data collection | Pending |
| [ ] Grievance Officer | Appoint and publish contact details | Pending |
| [ ] Data Retention Policy | Define how long data is kept | Pending |
| [ ] Children's Data | Age verification if applicable | N/A |

### E-Commerce Compliance (India)

| Requirement | Description | Status |
|-------------|-------------|--------|
| [ ] Legal Entity Display | Company name, address on website | Pending |
| [ ] GSTIN Display | GST number visible on invoices | Pending |
| [ ] Return Policy | Clear return/refund policy page | Pending |
| [ ] Terms of Service | Terms and conditions page | Pending |
| [ ] Contact Information | Customer support contact details | Pending |
| [ ] Invoice Generation | GST-compliant invoices | Pending |
| [ ] Price Display | MRP and selling price clearly shown | Pending |

### Security Certifications (Future)

| Certification | Description | Status |
|---------------|-------------|--------|
| [ ] SOC 2 Type II | Security, availability, confidentiality | Future |
| [ ] ISO 27001 | Information security management | Future |
| [ ] VAPT Report | Vulnerability Assessment & Penetration Testing | Pending |

---

## Compliance Action Items

### Immediate (Before Launch)

1. **Privacy Policy Page** - Create `/privacy` with data collection practices
2. **Terms of Service Page** - Create `/terms` with usage terms
3. **Cookie Consent Banner** - Implement opt-in cookie consent
4. **Contact Page** - Add support email, phone, address
5. **Return Policy Page** - Create `/returns` with refund policy

### Short-term (Within 30 Days)

1. **Data Export API** - Implement `/api/user/export-data`
2. **Data Deletion API** - Implement `/api/user/delete-account`
3. **Invoice Generation** - GST-compliant invoice PDFs
4. **VAPT Assessment** - Schedule penetration testing

### Long-term (Within 90 Days)

1. **DPA Agreements** - Sign with Supabase, Razorpay, Shiprocket
2. **PCI SAQ-A** - Complete self-assessment
3. **Data Retention Policy** - Document and implement
4. **Incident Response Plan** - Document breach procedures

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-07 | Initial security implementation | Claude |
| 2026-01-07 | Added OTP brute force protection | Claude |
| 2026-01-07 | Enabled RLS on all tables | Claude |
| 2026-01-07 | Fixed guest checkout RLS issue | Claude |

---

*Last Updated: 2026-01-07*
