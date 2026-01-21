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
| `lib/csrf.ts` | CSRF token generation and validation | Done |
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
| `/api/seller/shiprocket/estimate-shipping` | 20/min | Zod schema | None (guest) | Yes | Done |

### Admin Routes (Require Authentication)

| Route | Auth | Rate Limit | Logging | Status |
|-------|------|------------|---------|--------|
| `/api/orders/get-new-orders` | Admin role | - | Yes | Done |
| `/api/orders/get-cancellation-failed` | Admin role | - | Yes | Done |
| `/api/orders/cancel/retry` | Admin role | - | Yes | Done |
| `/api/seller/products` (GET) | Admin role | - | Yes | Done |
| `/api/seller/products` (POST) | Admin role + validation | - | Yes | Done |
| `/api/seller/shiprocket/assign-awb` | Admin role | 30/min | Yes | Done |
| `/api/seller/shiprocket/generate-label` | Admin role | 30/min | Yes | Done |
| `/api/seller/shiprocket/schedule-pickup` | Admin role | 30/min | Yes | Done |
| `/api/seller/shiprocket/generate-manifest-batch` | Admin role | 30/min | Yes | Done |

### User Routes (Require Authentication)

| Route | Auth | Rate Limit | Description | Status |
|-------|------|------------|-------------|--------|
| `/api/user/export-data` | User auth | 5/hour | GDPR data export | Done |
| `/api/user/delete-account` | User auth | 3/hour | GDPR account deletion | Done |

---

## Phase 3: Remaining Work [PARTIALLY COMPLETED]

### 3.1 High Priority [COMPLETED]

| Task | Description | Status |
|------|-------------|--------|
| Shiprocket routes security | Add auth, validation, logging to `/api/seller/shiprocket/*` | Done |
| Webhook security | Verify signatures on `/api/webhooks/razorpay/*` and `/api/webhooks/shiprocket` | Done (already implemented) |
| CSRF protection | Add CSRF tokens for state-changing operations | Done |
| Fix TypeScript errors | Clean up `any` types in shiprocket/webhook routes | Done |

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
│  Layer 4: CSRF Protection               │
│  - Token generation & validation        │
│  - Double-submit cookie pattern         │
├─────────────────────────────────────────┤
│  Layer 5: Authentication/Authorization  │
│  - Admin routes: requireRole("admin")   │
│  - Guest routes: email/OTP verification │
├─────────────────────────────────────────┤
│  Layer 6: RLS (Database level)          │
│  - Protects direct DB access            │
│  - Bypassed by service role for APIs    │
├─────────────────────────────────────────┤
│  Layer 7: Logging & Monitoring          │
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

# CSRF (optional - falls back to using part of SUPABASE_SERVICE_ROLE_KEY)
CSRF_SECRET=your-32-char-secret
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
- [ ] CSRF protection blocks requests without valid token
- [ ] Data export returns user's data correctly
- [ ] Account deletion anonymizes order data

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
| Privacy Policy | Clear privacy policy page | Done (`/privacy-policy`) |
| Cookie Consent | Cookie banner with opt-in/opt-out | Done (`CookieConsent` component) |
| Data Minimization | Only collect necessary data | Partial |
| Right to Access | User data export API | Done (`/api/user/export-data`) |
| Right to Erasure | User data deletion API | Done (`/api/user/delete-account`) |
| Data Portability | Export data in machine-readable format | Done (JSON export) |
| Breach Notification | Process for notifying users within 72 hours | Done (`lib/email.ts`, `INCIDENT_RESPONSE.md`) |
| [ ] DPA with Supabase | Data Processing Agreement | Pending |
| [ ] DPA with Razorpay | Data Processing Agreement | Pending |
| [ ] Consent Records | Log user consent for marketing | Pending |

### India IT Act & DPDP Act (Digital Personal Data Protection)

| Requirement | Description | Status |
|-------------|-------------|--------|
| [ ] Data Localization | Verify data storage location (Supabase region) | Pending |
| Consent Management | Clear consent for data collection | Done (Cookie Consent) |
| [ ] Grievance Officer | Appoint and publish contact details | Pending |
| Data Retention Policy | Define how long data is kept | Done (see below) |
| Data Portability | Export user data in machine-readable format | Done (`/my-data` page) |
| Right to Erasure | Allow users to delete their data | Done (`/my-data` page) |
| [ ] Children's Data | Age verification if applicable | N/A (18+ in ToS) |

#### Data Retention Schedule

| Data Type | Retention Period | Legal Basis | Deletion Method |
|-----------|------------------|-------------|-----------------|
| Order Data (transactions) | 7 years | Income Tax Act, Section 44AA | Anonymization on request |
| Personal Info (name, email, phone, address) | Until deletion request | Consent / Contractual necessity | Via `/my-data` page |
| Security Incidents | 3 years | Legitimate interest | Automatic purge |
| Audit Logs | 3 years | Legal compliance (DPDP Act) | Automatic purge |
| OTP Codes | 10 minutes | Security | Automatic expiry |
| Session Tokens | 15 minutes | Security | Automatic expiry |
| Rate Limit Data | 1 hour | Security | In-memory, automatic |
| Payment Data | Per Razorpay policy | PCI-DSS compliance | Handled by Razorpay |
| Shipping Data | Per Shiprocket policy | Contractual | Handled by Shiprocket |

### E-Commerce Compliance (India)

| Requirement | Description | Status |
|-------------|-------------|--------|
| [ ] Legal Entity Display | Company name, address on website | Pending |
| GSTIN Display | GST number visible on invoices | Done (in receipt generation) |
| Return Policy | Clear return/refund policy page | Done (`/return-policy`) |
| Terms of Service | Terms and conditions page | Done (`/terms`) |
| Contact Information | Customer support contact details | Done (`/contact`) |
| Invoice Generation | GST-compliant invoices | Done (`lib/receipt.ts`) |
| [ ] Price Display | MRP and selling price clearly shown | Pending |

### Security Certifications (Future)

| Certification | Description | Status |
|---------------|-------------|--------|
| [ ] SOC 2 Type II | Security, availability, confidentiality | Future |
| [ ] ISO 27001 | Information security management | Future |
| [ ] VAPT Report | Vulnerability Assessment & Penetration Testing | Pending |

---

## Files Created/Modified (2026-01-14)

### New Files
- `lib/csrf.ts` - CSRF token generation and validation
- `app/api/csrf/route.ts` - CSRF token endpoint
- `hooks/useCsrf.ts` - Client-side CSRF hook
- `components/CookieConsent.tsx` - Cookie consent banner component
- `app/api/user/export-data/route.ts` - GDPR data export API
- `app/api/user/delete-account/route.ts` - GDPR account deletion API

### Modified Files
- `lib/rate-limit.ts` - Added shipping rate limiters
- `app/api/seller/shiprocket/assign-awb/route.ts` - Added auth, rate limiting, logging
- `app/api/seller/shiprocket/estimate-shipping/route.ts` - Added rate limiting, validation, logging
- `app/api/seller/shiprocket/generate-label/route.ts` - Added auth, rate limiting, logging
- `app/api/seller/shiprocket/schedule-pickup/route.ts` - Added auth, rate limiting, logging
- `app/api/seller/shiprocket/generate-manifest-batch/route.ts` - Added auth, rate limiting, logging
- `app/layout.tsx` - Added CookieConsent component

## Files Created/Modified (2026-01-18)

### New Files - Incident Response System
- `INCIDENT_RESPONSE.md` - Incident response procedures documentation
- `lib/incident.ts` - Core incident detection, management, and account lockout
- `supabase/migrations/20260118120000_security_incidents.sql` - Security incidents table
- `app/api/admin/incidents/route.ts` - List incidents API
- `app/api/admin/incidents/[id]/route.ts` - Get/update incident API
- `app/api/admin/account/lock/route.ts` - Lock admin account API
- `app/api/admin/account/unlock/route.ts` - Unlock admin account API
- `app/admin/security/page.tsx` - Security dashboard page
- `components/SecurityDashboard.tsx` - Security incidents admin UI

### Modified Files
- `lib/auth.ts` - Added account lockout check to `requireAuth()`
- `lib/email.ts` - Added breach notification email templates
- `lib/logger.ts` - Added `trackSecurityEvent()` with anomaly detection

## Files Created/Modified (2026-01-19)

### New Files - DPDP Compliance & Security Hardening
- `lib/xss.ts` - Client-safe XSS prevention utilities (escapeHtml, sanitizeUrl)
- `lib/audit.ts` - Audit logging utility for DPDP Act compliance
- `supabase/migrations/20260119120000_manifest_batches_rls.sql` - RLS policies for manifest_batches
- `supabase/migrations/20260119120100_audit_log.sql` - Audit log and vendor breach log tables
- `supabase/migrations/20260119120200_cia_incident_types.sql` - CIA triad incident types

### Modified Files
- `lib/email.ts` - Added `escapeHtml()` to all templates, added `sendDPBBreachNotification()`
- `lib/incident.ts` - Added CIA triad incident types (bulk_data_export, data_deletion_alert, etc.)
- `components/ReadyToShipOrders.tsx` - Added URL sanitization for Shiprocket URLs
- `components/SecurityDashboard.tsx` - Added labels for new incident types
- `app/track/page.tsx` - Added URL sanitization for tracking URLs
- `INCIDENT_RESPONSE.md` - Added DPDP Act compliance section

---

## Compliance Action Items

### Immediate (Before Launch) [MOSTLY COMPLETE]

1. **Privacy Policy Page** - Done (`/privacy-policy`)
2. **Terms of Service Page** - Done (`/terms`)
3. **Cookie Consent Banner** - Done (`CookieConsent` component)
4. **Contact Page** - Done (`/contact`)
5. **Return Policy Page** - Done (`/return-policy`)

### Short-term (Within 30 Days) [MOSTLY COMPLETE]

1. **Data Export API** - Done (`/api/user/export-data`)
2. **Data Deletion API** - Done (`/api/user/delete-account`)
3. **Invoice Generation** - Done (`lib/receipt.ts`, `lib/creditNote.ts`)
4. **VAPT Assessment** - Schedule penetration testing

### Long-term (Within 90 Days)

1. **DPA Agreements** - Sign with Supabase, Razorpay, Shiprocket
2. **PCI SAQ-A** - Complete self-assessment
3. **Data Retention Policy** - Document and implement
4. **Incident Response Plan** - Done (`INCIDENT_RESPONSE.md`, `lib/incident.ts`, `/admin/security`)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-07 | Initial security implementation | Claude |
| 2026-01-07 | Added OTP brute force protection | Claude |
| 2026-01-07 | Enabled RLS on all tables | Claude |
| 2026-01-07 | Fixed guest checkout RLS issue | Claude |
| 2026-01-14 | Secured all Shiprocket routes with auth, rate limiting, logging | Claude |
| 2026-01-14 | Implemented CSRF protection infrastructure | Claude |
| 2026-01-14 | Added cookie consent banner component | Claude |
| 2026-01-14 | Implemented GDPR data export API | Claude |
| 2026-01-14 | Implemented GDPR account deletion API | Claude |
| 2026-01-14 | Fixed TypeScript issues in Shiprocket routes | Claude |
| 2026-01-18 | Implemented full Incident Response System | Claude |
| 2026-01-19 | XSS prevention fixes in email templates and components | Claude |
| 2026-01-19 | Added RLS policies for manifest_batches table | Claude |
| 2026-01-19 | Implemented DPDP Act compliance (audit logging, CIA triad monitoring) | Claude |
| 2026-01-19 | Added DPB breach notification template | Claude |
| 2026-01-19 | Created vendor breach tracking system | Claude |
| 2026-01-21 | Implemented guest data access page (`/my-data`) | Claude |
| 2026-01-21 | Added guest data export/delete APIs with OTP verification | Claude |
| 2026-01-21 | Added DPDP compliance tab to security dashboard | Claude |
| 2026-01-21 | Documented data retention schedule | Claude |
| 2026-01-21 | Added DPDP audit logging to checkout, order detail, admin orders, cancel, track endpoints | Claude |

---

*Last Updated: 2026-01-21*
