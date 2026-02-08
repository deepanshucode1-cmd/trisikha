# DPDP Rules 2025 Full Compliance Implementation Plan

## Executive Summary

This plan outlines the implementation steps to make Trisikha fully compliant with India's Digital Personal Data Protection (DPDP) Rules 2025. The app is currently ~85% compliant with strong foundations in deletion, access, portability, and breach notification. This plan addresses the remaining gaps.

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
| Breach Notification | ✅ Complete | Incident response system + email templates |
| Audit Trail | ✅ Complete | `audit_log` table |
| Tax Compliance | ✅ Complete | 8-year retention for paid orders |
| Cookie Consent | ✅ Basic | `CookieConsent.tsx` |
| OTP Security | ✅ Complete | Rate limiting, brute force protection |
| Admin Deletion Dashboard | ✅ Complete | `/api/admin/deletion-requests`, `DeletionRequestsTab.tsx` |

### Gaps to Address
| Priority | Feature | DPDP Rule Reference | Status |
|----------|---------|---------------------|--------|
| HIGH | ~~Admin Dashboard for Deletion Requests~~ | Operational need | ✅ Done |
| HIGH | ~~Privacy Policy Update (7yr → 8yr)~~ | Rule 8 | ✅ Done |
| HIGH | ~~Right to Correction API~~ | Rule 14 | ✅ Done |
| HIGH | ~~Grievance Redressal (90-day SLA)~~ | Rule 14 | ✅ Done |
| MEDIUM | Enhanced Consent Management | Rule 3, 4 | |
| MEDIUM | 48-hour Pre-Erasure Notification | Rule 8 | |
| MEDIUM | Nominee Appointment System | Rule 14 | |
| MEDIUM | Plain Language Itemized Notices | Rule 3 | |
| LOW | 1-Year Inactivity Auto-Deletion | Rule 8 | |
| LOW | Email Unsubscribe Mechanism | Rule 4 | |
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

#### 2.1 Enhanced Consent Management
**Files to modify/create:**
- `components/ConsentManager.tsx` (new)
- `app/api/consent/route.ts` (new)
- `lib/consent.ts` (new)

**Features:**
- Purpose-specific consent tracking (order processing, marketing, analytics)
- Consent withdrawal mechanism
- Consent audit trail
- Itemized notice display before data collection

**Database changes:**
- `supabase/migrations/YYYYMMDD_consent_records.sql`
  - `consent_records` table: id, email, purpose, granted, granted_at, withdrawn_at, ip_address, user_agent

#### 2.2 48-Hour Pre-Erasure Notification
**Files to modify:**
- `app/api/cron/process-deletions/route.ts`
- `lib/email.ts`

**Changes:**
- Add 48-hour warning email before deletion execution
- New email template: `sendPreErasureNotification`
- Update cron job to check for requests 48 hours before eligibility

#### 2.3 Nominee Appointment System
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

#### 2.4 Plain Language Itemized Notices
**Files to modify:**
- `app/checkout/page.tsx` (or equivalent)
- `components/DataCollectionNotice.tsx` (new)

**Features:**
- Display itemized list of data being collected at checkout
- Clear explanation of each data point's purpose
- Link to full privacy policy
- Consent checkbox with granular options

---

### Phase 3: Automation & Documentation (LOW Priority)

#### 3.1 1-Year Inactivity Auto-Deletion
**Files to create:**
- `app/api/cron/inactivity-check/route.ts`
- `lib/inactivity.ts`

**Features:**
- Identify accounts inactive for 1 year
- Send warning emails (30 days, 7 days, 48 hours before)
- Auto-create deletion requests for inactive accounts
- Exclude accounts with legal retention requirements

**Database changes:**
- `supabase/migrations/YYYYMMDD_inactivity_tracking.sql`
  - Add `last_activity_at` to orders or create `activity_log` table

#### 3.2 Email Unsubscribe Mechanism
**Files to create:**
- `app/api/unsubscribe/route.ts`
- `app/unsubscribe/page.tsx`

**Features:**
- One-click unsubscribe from marketing emails
- Manage email preferences
- Persist preferences in database

**Database changes:**
- `supabase/migrations/YYYYMMDD_email_preferences.sql`
  - `email_preferences` table: id, email, marketing, transactional, created_at, updated_at

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

| Migration | Tables/Changes |
|-----------|----------------|
| `correction_requests.sql` | `correction_requests` table |
| `grievances.sql` | `grievances` table |
| `consent_records.sql` | `consent_records` table |
| `nominees.sql` | `nominees` table |
| `inactivity_tracking.sql` | `last_activity_at` field or `activity_log` table |
| `email_preferences.sql` | `email_preferences` table |

---

## API Endpoints Summary

### New Guest APIs
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/guest/correct-data` | Request data correction |
| GET | `/api/guest/correction-status` | Check correction request status |
| POST | `/api/guest/grievance` | Submit grievance |
| GET | `/api/guest/grievance` | Check grievance status |
| POST | `/api/guest/nominee` | Appoint nominee |
| DELETE | `/api/guest/nominee` | Remove nominee |

### New Admin APIs
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/admin/corrections` | List correction requests |
| POST | `/api/admin/corrections/[id]` | Process correction |
| GET | `/api/admin/grievances` | List grievances with stats |
| GET | `/api/admin/grievances/[id]` | Get grievance detail |
| PATCH | `/api/admin/grievances/[id]` | Update grievance status/priority |

---

## Verification & Testing

### Functional Testing
1. **Deletion Flow:** Request → 14-day window → Admin approval → Execution
2. **Correction Flow:** Request → Admin review → Apply correction → Audit log
3. **Grievance Flow:** Submit → Track → 90-day SLA → Resolution
4. **Consent Flow:** Collection notice → Purpose consent → Withdrawal
5. **Nominee Flow:** Appointment → Verification → Rights exercise

### Compliance Verification
1. Run through all Data Principal rights as a test user
2. Verify all audit logs are being captured
3. Confirm email notifications at each stage
4. Test 48-hour pre-erasure notification
5. Verify privacy policy reflects all current practices

### Security Testing
1. OTP brute force protection
2. Rate limiting on all guest APIs
3. Admin authentication on sensitive endpoints
4. Audit log immutability

---

## Implementation Order

```
Week 1-2:   Phase 1.1 - Admin Dashboard for Deletion Requests
Week 2-3:   Phase 1.2 - Privacy Policy Update
Week 3-4:   Phase 1.3 - Right to Correction API
Week 4-5:   Phase 1.4 - Grievance Redressal System
Week 5-6:   Phase 2.1 - Enhanced Consent Management
Week 6-7:   Phase 2.2 - 48-Hour Pre-Erasure Notification
Week 7-8:   Phase 2.3 - Nominee Appointment System
Week 8-9:   Phase 2.4 - Plain Language Itemized Notices
Week 9-10:  Phase 3.1 - 1-Year Inactivity Auto-Deletion
Week 10-11: Phase 3.2 - Email Unsubscribe Mechanism
Week 11-12: Phase 3.3 - Documentation + Final Testing
```

---

## Sources

- [India Briefing - DPDP Rules 2025 Compliance](https://www.india-briefing.com/news/dpdp-rules-2025-india-data-protection-law-compliance-40769.html/)
- [DPDPA.com - DPDP Rules Guide](https://dpdpa.com/dpdparules.html)
- [EY - Transforming Data Privacy DPDP Rules 2025](https://www.ey.com/en_in/insights/cybersecurity/transforming-data-privacy-digital-personal-data-protection-rules-2025)
- [Official PIB Notification](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)
- [MeitY - DPDP Rules 2025](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa)
