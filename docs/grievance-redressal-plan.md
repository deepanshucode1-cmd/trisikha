# Grievance Redressal System — DPDP Rule 14(3) Compliance

## Context
DPDP Rules 2025 (Rule 14(3)) require Data Fiduciaries to implement a grievance redressal system with a 90-day SLA and publish the timeline prominently. The privacy policy already names the Grievance Officer. This implementation adds the trackable digital system to prove compliance.

## Architecture Overview
Follows the exact same pattern as the correction request system:
- **Service layer**: `lib/grievance.ts`
- **Guest API**: `app/api/guest/grievance/route.ts` (POST submit + GET status)
- **Admin APIs**: `app/api/admin/grievances/route.ts` (list+stats), `app/api/admin/grievances/[id]/route.ts` (detail+update)
- **Guest page**: `app/grievance/page.tsx` (OTP-verified, multi-step)
- **Admin component**: `components/GrievancesTab.tsx`
- **Email notifications**: received, status update, resolved
- **DB migration**: `supabase/migrations/` grievances table

---

## Step 1: Database Migration

**File**: `supabase/migrations/20260208_grievances.sql`

```sql
CREATE TABLE grievances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'data_processing', 'correction', 'deletion', 'consent', 'breach', 'other'
  )),
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'in_progress', 'resolved', 'closed'
  )),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN (
    'low', 'medium', 'high'
  )),
  admin_notes text,
  resolution_notes text,
  sla_deadline timestamptz NOT NULL,   -- created_at + 90 days
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_grievances_email ON grievances(email);
CREATE INDEX idx_grievances_status ON grievances(status);
CREATE INDEX idx_grievances_sla_deadline ON grievances(sla_deadline);
CREATE INDEX idx_grievances_created_at ON grievances(created_at DESC);

-- RLS
ALTER TABLE grievances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON grievances
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admin read access" ON grievances
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_role WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  ));

CREATE POLICY "Admin update access" ON grievances
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_role WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  ));
```

---

## Step 2: Service Layer

**File**: `lib/grievance.ts`

Types and functions (following `lib/correction-request.ts` pattern):

```
Types:
  GrievanceStatus = "open" | "in_progress" | "resolved" | "closed"
  GrievanceCategory = "data_processing" | "correction" | "deletion" | "consent" | "breach" | "other"
  GrievancePriority = "low" | "medium" | "high"
  Grievance (interface matching table columns)
  CreateGrievanceParams { email, subject, description, category, ip, userAgent? }
  UpdateGrievanceParams { grievanceId, status?, priority?, adminNotes?, resolutionNotes?, adminId }

Functions:
  createGrievance(params) → { grievanceId, slaDeadline }
    - SLA deadline = now + 90 days
    - Audit log via logDataAccess()
    - Security event log

  getGrievancesByEmail(email) → Grievance[]
    - Ordered by created_at DESC

  getGrievances({ status?, email?, category?, limit?, offset? }) → { grievances, total }
    - Pagination, partial email match (ILIKE)

  getGrievanceById(id) → Grievance | null

  updateGrievance(params) → { success, message }
    - Sets resolved_at + resolved_by when status → resolved/closed
    - Audit log + security event

  getGrievanceStats() → { open, inProgress, resolved, closed, overdue }
    - overdue = open/in_progress where sla_deadline < now()
```

Reuse: `createServiceClient`, `logDataAccess`, `logSecurityEvent`, `logError`

---

## Step 3: Guest API

**File**: `app/api/guest/grievance/route.ts`

### POST — Submit grievance
```
Flow:
  1. Rate limit: `apiRateLimit.limit(`guest-grievance:${ip}`)` — 3/hour
  2. Zod validate: { email, sessionToken, subject (5-200 chars), description (20-2000 chars), category (enum) }
  3. sanitizeObject(parseResult.data)
  4. Verify session from guest_data_sessions (same pattern as correct-data)
  5. Check session expiry
  6. Verify email has confirmed/paid orders (prevents abuse from non-customers)
     → SELECT count(*) FROM orders WHERE guest_email = normalizedEmail AND order_status != 'CHECKED_OUT'
     → If 0: return 403 "Grievances can only be filed by customers with confirmed orders."
  7. Call createGrievance()
  8. Send confirmation email (non-blocking)
  9. Return { success, grievanceId, slaDeadline }
```

### GET — Check grievance status
```
Query params: email, sessionToken
Flow:
  1. Rate limit
  2. Verify session
  3. Call getGrievancesByEmail(email)
  4. Return grievances with SLA countdown
```

---

## Step 4: Admin APIs

### `app/api/admin/grievances/route.ts` — GET list + stats
```
Query params: status, email, category, limit (default 20), offset (default 0)
Flow:
  1. Check auth + admin role (same pattern as corrections admin)
  2. Call getGrievances() with filters
  3. Call getGrievanceStats()
  4. Return { grievances, total, stats }
```

### `app/api/admin/grievances/[id]/route.ts` — GET detail + PATCH update
```
GET:
  1. Check auth + admin role
  2. Call getGrievanceById(id)
  3. Return grievance or 404

PATCH:
  1. CSRF protection (requireCsrf)
  2. Check auth + admin role
  3. Zod validate: { status? (enum), priority? (enum), adminNotes?, resolutionNotes? }
  4. sanitizeObject()
  5. Call updateGrievance()
  6. Send status update email (non-blocking)
  7. Return { success, message }
```

---

## Step 5: Email Notifications

**File**: `lib/email.ts` — add 3 functions

```
sendGrievanceReceived(email, { grievanceId, subject, slaDeadline })
  → "Your grievance has been received. Reference: {id}. We will respond by {slaDeadline}."

sendGrievanceStatusUpdate(email, { grievanceId, subject, newStatus, adminNotes? })
  → "Your grievance {id} status has been updated to {status}."

sendGrievanceResolved(email, { grievanceId, subject, resolutionNotes })
  → "Your grievance {id} has been resolved. Resolution: {notes}."
```

Pattern: HTML email with escapeHtml() for user content, matching existing templates.

---

## Step 6: Guest Page

**File**: `app/grievance/page.tsx`

Multi-step form (same pattern as `/app/my-data/page.tsx` + `/app/correct-data/page.tsx`):

```
Steps: "email" → "otp" → "grievance"

"email" step:
  - Email input → POST /api/guest/send-data-otp (reuse existing OTP endpoint)

"otp" step:
  - 6-digit OTP input → POST /api/guest/verify-data-otp → get sessionToken

"grievance" step (two sections):
  Section 1: Submit New Grievance
    - Category dropdown (data_processing, correction, deletion, consent, breach, other)
    - Subject input (5-200 chars)
    - Description textarea (20-2000 chars)
    - Submit button → POST /api/guest/grievance

  Section 2: My Grievances (auto-loaded)
    - Table of past grievances with: subject, category, status badge, SLA deadline, created date
    - SLA countdown (days remaining / overdue badge in red)
    - Click to expand resolution notes
```

UI: Tailwind + DaisyUI, react-toastify for notifications. Same styling as existing pages.

---

## Step 7: Admin Dashboard Tab

**File**: `components/GrievancesTab.tsx`

Following `components/DeletionRequestsTab.tsx` pattern:

```
Stats cards row:
  - Open (yellow), In Progress (blue), Resolved (green), Closed (gray), Overdue (red)

Filters row:
  - Status dropdown, Category dropdown, Email search input

Table:
  - Columns: Email, Subject, Category, Status, Priority, SLA Deadline, Created
  - Status badges with colors
  - SLA deadline with overdue highlighting (red if past)
  - Click row → detail modal

Detail modal:
  - Full grievance info (subject, description, category, dates)
  - SLA deadline with countdown
  - Admin form: status dropdown, priority dropdown, admin notes textarea, resolution notes textarea
  - Save button → PATCH /api/admin/grievances/[id]
```

**Integration**: Import in the admin dashboard page where other tabs (DeletionRequestsTab, CorrectionRequestsTab) are used. Add a "Grievances" tab.

---

## Files Summary

| Action | File |
|--------|------|
| CREATE | `supabase/migrations/20260208_grievances.sql` |
| CREATE | `lib/grievance.ts` |
| CREATE | `app/api/guest/grievance/route.ts` |
| CREATE | `app/api/admin/grievances/route.ts` |
| CREATE | `app/api/admin/grievances/[id]/route.ts` |
| CREATE | `app/grievance/page.tsx` |
| CREATE | `components/GrievancesTab.tsx` |
| MODIFY | `lib/email.ts` — add 3 email functions |
| MODIFY | Admin dashboard page — add Grievances tab |

Reuse from existing codebase:
- `lib/rate-limit.ts` → `apiRateLimit`, `getClientIp`
- `lib/xss.ts` → `sanitizeObject`
- `lib/errors.ts` → `handleApiError`
- `lib/logger.ts` → `logSecurityEvent`, `logError`
- `lib/audit.ts` → `logDataAccess`
- `lib/csrf.ts` → `requireCsrf`
- `utils/supabase/service.ts` → `createServiceClient`
- `utils/supabase/server.ts` → `createClient`
- OTP flow → reuse existing `/api/guest/send-data-otp` and `/api/guest/verify-data-otp`

## Verification
1. `npm run build` — no type errors
2. Run Supabase migration
3. Test guest flow: email → OTP → submit grievance → verify status displays
4. Test admin flow: list grievances → filter by status → open detail → update status → verify email sent
5. Verify SLA deadline is correctly set to created_at + 90 days
6. Verify `sanitizeObject` applied on all POST/PATCH inputs
7. Verify audit logs created for grievance creation and status updates
