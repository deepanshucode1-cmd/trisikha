# DPDP Rules 2025 Full Compliance Implementation Plan

## Executive Summary

This plan outlines the implementation steps to make Trisikha fully compliant with India's Digital Personal Data Protection (DPDP) Rules 2025. The app is currently ~95% compliant with strong foundations in deletion, access, portability, breach notification, grievance redressal, data correction, and data collection notices. This plan tracks all items.

**Compliance Deadline:** May 13, 2027 (18 months from notification)

### Scope Determination
- **Children's Data:** No - adult customers only (no parental consent mechanisms needed)
- **Significant Data Fiduciary:** No - under 2 crore users (no annual DPIA/audit requirements)
- **Implementation Scope:** Full compliance - all HIGH, MEDIUM, and LOW priority items

---

## Current Compliance Status

### Already Implemented
| Feature | Status | Location |
|---------|--------|----------|
| Right to Access | ✅ Complete | `/api/guest/get-data` |
| Right to Data Portability | ✅ Complete | `/api/guest/export-data` (JSON) |
| Right to Erasure | ✅ Complete | `/api/guest/delete-data` (14-day window) |
| Right to Correction | ✅ Complete | `/api/guest/correct-data`, `lib/correction-request.ts` |
| Grievance Redressal (90-day SLA) | ✅ Complete | `/api/guest/grievance`, `lib/grievance.ts`, `/grievance` |
| Data Collection Notice (Rule 3) | ✅ Complete | `DataCollectionNotice.tsx` (EN/HI, layered) |
| Privacy Policy (DPDP-aligned) | ✅ Complete | `/privacy-policy` — Section 7 legal basis, rights, grievance |
| Breach Notification | ✅ Complete | Incident response system + email templates |
| Audit Trail | ✅ Complete | `audit_log` table |
| Tax Compliance | ✅ Complete | 8-year retention for paid orders |
| Cookie Consent | ✅ Basic | `CookieConsent.tsx` (admin auth only) |
| OTP Security | ✅ Complete | Rate limiting, brute force protection |
| XSS Sanitization | ✅ Complete | `sanitizeObject()` on all POST/PUT/PATCH routes |
| Admin Deletion Dashboard | ✅ Complete | `/api/admin/deletion-requests`, `DeletionRequestsTab.tsx` |
| Admin Corrections Dashboard | ✅ Complete | `/api/admin/corrections`, `CorrectionRequestsTab.tsx` |
| Admin Grievances Dashboard | ✅ Complete | `/api/admin/grievances`, `GrievancesTab.tsx` |
| Footer Links (My Data, Grievance, Return Policy) | ✅ Complete | `Footer.tsx` |

### Gaps to Address
| Priority | Feature | DPDP Rule Reference | Status |
|----------|---------|---------------------|--------|
| HIGH | ~~Admin Dashboard for Deletion Requests~~ | Operational need | ✅ Done |
| HIGH | ~~Privacy Policy Update (7yr → 8yr)~~ | Rule 8 | ✅ Done |
| HIGH | ~~Right to Correction API~~ | Rule 14 | ✅ Done |
| HIGH | ~~Grievance Redressal (90-day SLA)~~ | Rule 14(3) | ✅ Done |
| HIGH | ~~Data Collection Notice (Rule 3)~~ | Rule 3 | ✅ Done |
| HIGH | ~~Privacy Policy — Section 7 legal basis, rights, DPB~~ | Rule 3, Section 7 | ✅ Done |
| MEDIUM | ~~Enhanced Consent Management~~ | Section 6, 7 | ✅ Not needed — order processing is Section 7 legitimate use, no consent required |
| MEDIUM | ~~Plain Language Itemized Notices~~ | Rule 3 | ✅ Done — `DataCollectionNotice.tsx` with layered EN/HI notice |
| MEDIUM | 48-hour Pre-Erasure Notification | Rule 8 | ✅ Done |
| MEDIUM | Nominee Appointment System | Rule 14 | |
| LOW | ~~1-Year Inactivity Auto-Deletion~~ | Rule 8 | ✅ Not applicable — guest-only model, no user accounts |
| LOW | Marketing Consent (when needed) | Rule 4 | Deferred — implement when marketing emails are planned |
| LOW | Data Processing Agreement Docs | Best practice | |

---

## Implementation Plan

### Phase 1: Critical Fixes (HIGH Priority)

#### 1.1 Admin Dashboard for Deletion Requests ✅ COMPLETED
**Implemented in:**
- `app/api/admin/deletion-requests/route.ts` - List requests with filters
- `app/api/admin/deletion-requests/[id]/route.ts` - Get/execute individual requests
- `app/api/admin/deletion-requests/stats/route.ts` - Statistics endpoint
- `app/api/admin/deletion-requests/bulk-execute/route.ts` - Bulk execution
- `components/DeletionRequestsTab.tsx` - Admin UI component
- `lib/deletion-request.ts` - Service layer with tax compliance

**Features delivered:**
- List all deletion requests with filters (status, email, date)
- View request details with associated orders
- Execute single/bulk deletions
- Show tax compliance status (paid vs unpaid orders)
- Statistics dashboard
- 14-day cooling-off window with reminders

#### 1.2 Privacy Policy Update ✅ COMPLETED
**Files modified:**
- `app/privacy-policy/page.tsx`

**Changes delivered:**
- Updated retention period from 7 years to 8 years (CGST Act Section 36)
- Added DPDP Act 2023 and DPDP Rules 2025 reference in introduction
- Added grievance redressal section (Section 8) with 90-day SLA and Grievance Officer details
- Added nominee appointment section (Section 9) per Rule 14
- Expanded "Your Rights" to reference specific DPDP rules (access, correction, erasure, portability, nominee)
- Updated "Last updated" date to February 2026

#### 1.3 Right to Correction API ✅ COMPLETED
**Files created:**
- `app/api/guest/correct-data/route.ts` - Guest POST (submit) + GET (check status)
- `app/api/admin/corrections/route.ts` - Admin list with filters & stats
- `app/api/admin/corrections/[id]/route.ts` - Admin GET detail + POST approve/reject
- `lib/correction-request.ts` - Service layer with full workflow
- `supabase/migrations/20260204120000_correction_requests.sql` - Database migration

**Features delivered:**
- Verified guests can request corrections to name, email, phone, address
- Admin approval workflow (pending → approved/rejected)
- On approval, corrections are applied to orders table with proper field mapping
- Duplicate pending request prevention
- Full audit logging of all corrections via `logDataAccess`
- Session token verification (same pattern as delete-data)
- Rate limiting on guest endpoints

#### 1.4 Grievance Redressal System ✅ COMPLETED
**Files created:**
- `app/api/guest/grievance/route.ts` - Guest POST (submit) + GET (check status)
- `app/api/admin/grievances/route.ts` - Admin list with filters & stats
- `app/api/admin/grievances/[id]/route.ts` - Admin GET detail + PATCH update
- `lib/grievance.ts` - Service layer with CRUD, stats, audit logging
- `app/grievance/page.tsx` - Guest-facing multi-step form (email → OTP → submit/view)
- `components/GrievancesTab.tsx` - Admin dashboard tab
- `supabase/migrations/20260208_grievances.sql` - Database migration

**Features delivered:**
- OTP-verified guests with confirmed orders can file grievances
- Category-based grievances (data processing, correction, deletion, consent, breach, other)
- 90-day SLA deadline auto-set on creation (DPDP Rule 14(3))
- SLA countdown with overdue tracking in both guest and admin views
- Admin triage: status (open/in_progress/resolved/closed), priority (low/medium/high)
- Email notifications: received confirmation, status update, resolution
- Anti-abuse: requires confirmed orders (order_status != 'CHECKED_OUT')
- Rate limiting (3/hour), sanitizeObject on all inputs, CSRF on admin PATCH
- Full audit logging via logDataAccess + logSecurityEvent
- Integrated as "Grievances" tab in SecurityDashboard with stats cards, filters, table, detail modal

**Files modified:**
- `lib/email.ts` - Added sendGrievanceReceived, sendGrievanceStatusUpdate, sendGrievanceResolved
- `components/SecurityDashboard.tsx` - Added Grievances tab + updated DPDP compliance checklist

---

### Phase 2: Consent & Notices (MEDIUM Priority)

#### 2.1 Enhanced Consent Management ✅ NOT NEEDED
**Rationale:** Order processing is a "legitimate use" under Section 7 of the DPDP Act 2023. Placing an order is a voluntary act — fulfilling it does not require separate consent. A checkbox asking users to "acknowledge" the notice is itself a form of consent, which contradicts Section 7.

**What was needed instead:**
- Display-only data collection notice (Rule 3) — implemented in 2.4
- No consent database table, service layer, or withdrawal mechanism needed for order processing
- Marketing consent (Rule 4) deferred to Phase 3 — implement only when marketing emails are planned

**See:** `docs/enhanced-consent-management-plan.md` for full analysis.

#### 2.2 Data Collection Notice (Rule 3) ✅ COMPLETED
**Files created:**
- `components/checkout/DataCollectionNotice.tsx` - Display-only layered notice component

**Files modified:**
- `components/checkout/CheckoutPage.tsx` - Added notice above Place Order button
- `app/buy-now/page.tsx` - Added notice above Place Order button

**Features delivered:**
- **Layered notice approach** (Rule 3 best practice):
  - Layer 1: Summary always visible (what data, why, third parties)
  - Layer 2: Expandable full notice (itemized data, usage, rights, grievance officer)
  - Layer 3: Links to Privacy Policy, /my-data
- **English/Hindi toggle** (Rule 3 multilingual requirement)
- **User rights listed**: access, correct, erase, file grievance, complain to DPB, nominate
- **Third-party disclosure**: Supabase (storage), Razorpay (payment), Shiprocket (shipping)
- **No checkbox, no gating** — display-only, Place Order behavior unchanged
- **Grievance Officer contact** with 90-day SLA reference
- Present on both checkout and buy-now pages

#### 2.3 Privacy Policy Update ✅ COMPLETED
**Files modified:**
- `app/privacy-policy/page.tsx`

**Changes delivered:**
- Added Section 7 (legitimate use) as explicit legal basis for order processing
- Removed references to non-existent features (newsletter, surveys, account creation)
- Added purpose for each data item (matching the checkout notice)
- Expanded rights section: added "Right to File a Grievance" and "Right to Complain to DPB"
- Added /grievance link for online grievance filing
- Updated Supabase description to specify order data storage
- Consistent brand-color links throughout

#### 2.4 48-Hour Pre-Erasure Notification & Auto-Cleanup ✅ COMPLETED
**Files created:**
- `lib/auto-cleanup.ts` - Service layer for automatic data deletion
- `supabase/migrations/20260209_auto_cleanup.sql` - DB columns + indexes

**Files modified:**
- `lib/email.ts` - Added `sendPreErasureNotification()` (abandoned_checkout + retention_expired)
- `app/api/cron/process-deletions/route.ts` - Added 4 auto-cleanup steps to daily cron
- `lib/deletion-request.ts` - Added `deferred_erasure_notified` fields to interface

**Features delivered:**
- **Abandoned checkout cleanup (7-day cycle):**
  - Day 5+: Send 48-hour pre-erasure email (grouped by customer email)
  - Day 7+: Auto-delete orders + cascaded order_items (only after 48hr notice confirmed)
  - Tracks `cleanup_notice_sent` / `cleanup_notice_sent_at` on orders table
  - Partial index `idx_orders_abandoned` for efficient queries
- **Deferred legal expiry cleanup:**
  - 2 days before `retention_end_date`: Send 48-hour pre-erasure email
  - After expiry + 48hr notice: Delete all orders, mark deletion_request → completed
  - Tracks `deferred_erasure_notified` / `deferred_erasure_notified_at` on deletion_requests table
  - Partial index `idx_deletion_deferred_expiry` for efficient queries
  - Sends `sendDeletionCompleted` email after execution
- **Safety:** Only touches CHECKED_OUT/unpaid orders (never paid/confirmed); paid orders only deleted after 8-year retention expiry
- **Audit:** Full `logDataAccess` + `logSecurityEvent` for all notifications and deletions
- **Cron integration:** 4 new steps added to existing daily `process-deletions` cron, each in independent try/catch

#### 2.5 Nominee Appointment System
**Files to create:**
- `app/api/guest/nominee/route.ts`
- `app/my-data/nominee/page.tsx`

**Features:**
- Allow data principals to appoint nominees
- Nominee can exercise rights on behalf of principal
- Verification of nominee relationship

**Database changes:**
- `supabase/migrations/YYYYMMDD_nominees.sql`
  - `nominees` table: id, principal_email, nominee_name, nominee_email, nominee_phone, relationship, verified, created_at

---

### Phase 3: Automation & Documentation (LOW Priority)

#### 3.1 1-Year Inactivity Auto-Deletion ✅ NOT APPLICABLE
**Rationale:** Trisikha is a guest-only e-commerce store with no user accounts or login sessions. There are no "inactive accounts" to track. Abandoned checkout data is already handled by the 7-day auto-cleanup in Phase 2.4. Paid order data is retained for 8 years per tax law and auto-deleted via deferred legal expiry.

#### 3.2 Marketing Consent System (When Needed)
**Implement only when marketing emails are planned.** See `docs/enhanced-consent-management-plan.md` "Future Scope" section.

**Would require:**
- `consent_records` database table
- `lib/consent.ts` service layer (record, withdraw, query)
- `components/checkout/MarketingConsent.tsx` — opt-in, unchecked-by-default checkbox
- `app/api/guest/withdraw-consent/route.ts` — withdrawal endpoint
- Consent withdrawal UI in `/my-data`
- Email unsubscribe mechanism
- Admin consent records tab (optional)

#### 3.3 Data Processing Agreement Documentation
**Files to create:**
- `docs/data-processing-agreement.md`
- `docs/purpose-limitation-policy.md`

**Content:**
- Formal DPA with third-party processors (Razorpay, Shiprocket, Supabase)
- Purpose limitation documentation
- Data flow diagrams
- Retention schedules by data category

---

## Database Migration Summary

| Migration | Tables/Changes | Status |
|-----------|----------------|--------|
| `correction_requests.sql` | `correction_requests` table | ✅ Done |
| `grievances.sql` | `grievances` table | ✅ Done |
| `auto_cleanup.sql` | `cleanup_notice_sent` on orders, `deferred_erasure_notified` on deletion_requests, partial indexes | ✅ Done |
| `nominees.sql` | `nominees` table | Pending |
| `consent_records.sql` | `consent_records` table (marketing consent only) | Deferred — only when marketing emails are planned |

---

## API Endpoints Summary

### Guest APIs (Implemented)
| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| POST | `/api/guest/send-data-otp` | Send OTP for data access | ✅ |
| POST | `/api/guest/verify-data-otp` | Verify OTP | ✅ |
| GET | `/api/guest/get-data` | Fetch orders, deletions, corrections | ✅ |
| GET | `/api/guest/export-data` | Export all data as JSON | ✅ |
| POST | `/api/guest/correct-data` | Request data correction | ✅ |
| POST | `/api/guest/delete-data` | Request data deletion | ✅ |
| POST | `/api/guest/cancel-deletion` | Cancel pending deletion | ✅ |
| POST | `/api/guest/grievance` | Submit grievance | ✅ |
| GET | `/api/guest/grievance` | Check grievance status | ✅ |
| POST | `/api/guest/nominee` | Appoint nominee | Pending |
| DELETE | `/api/guest/nominee` | Remove nominee | Pending |

### Admin APIs (Implemented)
| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| GET | `/api/admin/deletion-requests` | List deletion requests | ✅ |
| GET/POST | `/api/admin/deletion-requests/[id]` | Get/execute deletion | ✅ |
| POST | `/api/admin/deletion-requests/bulk-execute` | Bulk execute | ✅ |
| GET | `/api/admin/correction-requests` | List corrections with stats | ✅ |
| GET/POST | `/api/admin/correction-requests/[id]` | Get/process correction | ✅ |
| GET | `/api/admin/grievances` | List grievances with stats | ✅ |
| GET/PATCH | `/api/admin/grievances/[id]` | Get/update grievance | ✅ |

---

## Verification & Testing

### Functional Testing
1. **Deletion Flow:** Request → 14-day window → Admin approval → Execution ✅
2. **Correction Flow:** Request → Admin review → Apply correction → Audit log ✅
3. **Grievance Flow:** Submit → Track → 90-day SLA → Resolution ✅
4. **Data Collection Notice:** Displays at checkout (cart + buy-now), layered, EN/HI toggle, no gating ✅
5. **Privacy Policy:** Section 7 legal basis, all rights listed, links to /my-data and /grievance ✅
6. **Nominee Flow:** Appointment → Verification → Rights exercise (pending)

### Compliance Verification
1. Run through all Data Principal rights as a test user
2. Verify all audit logs are being captured
3. Confirm email notifications at each stage
4. Test 48-hour pre-erasure notification
5. Verify privacy policy reflects all current practices
6. Verify data collection notice displays on both checkout and buy-now pages
7. Verify footer links to /my-data, /grievance, /return-policy, /privacy-policy

### Security Testing
1. OTP brute force protection
2. Rate limiting on all guest APIs
3. Admin authentication on sensitive endpoints
4. Audit log immutability

---

## Implementation Order

```
✅ Phase 1.1 - Admin Dashboard for Deletion Requests
✅ Phase 1.2 - Privacy Policy Update (8yr retention, DPDP references)
✅ Phase 1.3 - Right to Correction API + Admin Dashboard
✅ Phase 1.4 - Grievance Redressal System (90-day SLA)
✅ Phase 2.1 - Consent Analysis (Section 7 — no consent needed for orders)
✅ Phase 2.2 - Data Collection Notice (Rule 3, layered EN/HI)
✅ Phase 2.3 - Privacy Policy — Section 7 legal basis, rights, DPB, grievance link
✅ Phase 2.4 - 48-Hour Pre-Erasure Notification & Auto-Cleanup
⬜ Phase 2.5 - Nominee Appointment System
✅ Phase 3.1 - 1-Year Inactivity Auto-Deletion (not applicable — guest-only model)
⬜ Phase 3.2 - Marketing Consent System (when marketing emails are planned)
⬜ Phase 3.3 - Data Processing Agreement Documentation
```

---

## Sources

- [India Briefing - DPDP Rules 2025 Compliance](https://www.india-briefing.com/news/dpdp-rules-2025-india-data-protection-law-compliance-40769.html/)
- [DPDPA.com - DPDP Rules Guide](https://dpdpa.com/dpdparules.html)
- [EY - Transforming Data Privacy DPDP Rules 2025](https://www.ey.com/en_in/insights/cybersecurity/transforming-data-privacy-digital-personal-data-protection-rules-2025)
- [Official PIB Notification](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)
- [MeitY - DPDP Rules 2025](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa)
