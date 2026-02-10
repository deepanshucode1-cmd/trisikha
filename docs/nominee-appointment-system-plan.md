# Nominee Appointment System — Implementation Plan

## Overview

DPDP Rules 2025, Rule 14 grants every data principal the right to appoint a **nominee** who can exercise certain data rights on behalf of the principal in the event of their **death or incapacity**.

This plan covers:
1. **Nominee Appointment** — self-service, OTP-verified principal appoints a nominee
2. **Nominee Claim Submission** — nominee uploads proof documents and submits a claim
3. **Admin Claim Processing** — admin verifies and executes export/deletion on behalf
4. **Document Storage & Retention** — compliance-grade storage of proof documents

---

## Scope & Design Decisions

### What Rights Can a Nominee Exercise?

For a guest-only organic manure e-commerce store, only two rights are practical:

| Right | Applicable? | Reason |
|-------|-------------|--------|
| **Data Export** | Yes | Nominee may need order records for legal/estate purposes |
| **Data Deletion** | Yes | Nominee may want the deceased/incapacitated person's data erased |
| Data Correction | No | Principal is dead/incapacitated — no pending orders to correct |
| File Grievance | No | No ongoing data processing relationship to grieve about |
| Data Access (view) | No | Covered by export — admin exports and sends |

### How Are Rights Exercised?

**Admin-mediated.** The nominee does NOT get self-service access to the principal's data. Instead:

1. Nominee submits a claim with proof documents via a public form
2. Admin reviews the claim in the existing Security Dashboard
3. Admin executes export/deletion using existing admin tools on behalf of the nominee

This avoids building a separate nominee portal and keeps the human-in-the-loop for sensitive decisions.

### What Do Certificates Prove?

Certificates do **not** prove the nomination — that's already a verified record in the database (created by the OTP-verified principal). Certificates prove the **triggering condition**:

- **Death** → Death certificate (government-issued)
- **Incapacity** → Medical certificate from a registered medical practitioner, OR court order appointing legal guardianship / power of attorney

The admin performs a **reasonableness check**, not forensic verification. The document exists, looks plausible, and a nomination record matches — that's sufficient for a small e-commerce data fiduciary.

---

## Database Schema

### Migration: `supabase/migrations/20260210120000_nominee_appointments.sql`

```sql
-- Nominees table: stores appointment records
CREATE TABLE nominees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_email TEXT NOT NULL,
  nominee_name TEXT NOT NULL,
  nominee_email TEXT NOT NULL,

  relationship TEXT NOT NULL,  -- e.g., spouse, child, parent, sibling, legal_guardian, other
  nominee_email_verified BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  revoked_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active nominee per principal (can revoke and re-appoint)
CREATE UNIQUE INDEX idx_nominees_active_unique
  ON nominees (principal_email)
  WHERE status = 'active';

-- Lookup by nominee email (for claim verification)
CREATE INDEX idx_nominees_nominee_email ON nominees (nominee_email);

-- Nominee claims table: tracks claims submitted by nominees
CREATE TABLE nominee_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nominee_id UUID NOT NULL REFERENCES nominees(id),
  principal_email TEXT NOT NULL,
  nominee_email TEXT NOT NULL,
  claim_type TEXT NOT NULL CHECK (claim_type IN ('death', 'incapacity')),
  document_path TEXT NOT NULL,          -- Supabase Storage path in nominee-documents bucket
  document_filename TEXT NOT NULL,      -- Original filename for admin reference
  document_content_type TEXT NOT NULL,  -- MIME type of uploaded file
  action_export BOOLEAN NOT NULL DEFAULT false,
  action_deletion BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT nominee_claims_action_check CHECK (action_export OR action_deletion),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'completed')),
  admin_notes TEXT,
  processed_by TEXT,                    -- admin user ID
  processed_at TIMESTAMPTZ,
  document_retained_until TIMESTAMPTZ,  -- retention deadline for the uploaded document
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nominee_claims_status ON nominee_claims (status);
CREATE INDEX idx_nominee_claims_principal ON nominee_claims (principal_email);

-- RLS: service role only (same pattern as other sensitive tables)
ALTER TABLE nominees ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominee_claims ENABLE ROW LEVEL SECURITY;
```

### Supabase Storage Bucket

**Bucket:** `nominee-documents` (private, no public access)

- **Allowed MIME types:** `application/pdf`, `image/jpeg`, `image/png`
- **Max file size:** 10MB
- **Access:** Service role only — uploads and downloads go through API routes, never direct browser-to-storage
- **No public URL generation** — documents are fetched via signed URLs by admin only

Create via Supabase dashboard or migration:
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nominee-documents',
  'nominee-documents',
  false,
  10485760,  -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
);
```

---

## API Endpoints

### Guest Endpoints

#### `POST /api/guest/nominee/send-otp` — Send OTP to Nominee Email

**Auth:** Principal's OTP session token (principal must be verified first)
**Rate limit:** `nominee-otp:{ip}` — 3 requests/hour
**Body (Zod-validated + sanitized):**
```typescript
{
  email: string,           // principal's email
  sessionToken: string,    // principal's session token
  nomineeEmail: string     // nominee's email — OTP will be sent here
}
```

**Logic:**
1. Zod parse + `sanitizeObject()` on parsed input
2. Verify principal's OTP session (standard pattern)
3. Validate nominee email differs from principal email
4. Generate OTP for nominee email, store in `nominee_otp_sessions` (or reuse `guest_data_sessions` with a `purpose` field)
5. Send OTP to nominee's email with context: "You are being appointed as a nominee by [principal_email]. Enter this OTP to confirm."
6. Audit log

**Response:** `{ success: true, message: "OTP sent to nominee email." }`

**Why:** Verifying the nominee's email at appointment time ensures:
- No typos — the email actually exists and is accessible
- Nominee is aware they're being appointed (implicit consent)
- If a claim is needed years later, we know the email was valid

#### `POST /api/guest/nominee` — Appoint a Nominee

**Auth:** Principal's OTP session token + nominee's OTP verification
**Rate limit:** `guest-nominee:{ip}` — 3 requests/hour
**Body (Zod-validated + sanitized):**
```typescript
{
  email: string,           // principal's email
  sessionToken: string,    // principal's session token
  nomineeEmail: string,    // must differ from principal email
  nomineeOtp: string,      // 6-digit OTP sent to nominee's email
  nomineeName: string,     // max 100 chars

  relationship: "spouse" | "child" | "parent" | "sibling" | "legal_guardian" | "other"
}
```

**Logic:**
1. Zod parse + `sanitizeObject()` on parsed input
2. Verify principal's OTP session (standard pattern)
3. Verify nominee OTP is valid and not expired
4. Verify principal has at least one confirmed order (same as grievance — prevents abuse)
5. Check for existing active nominee — if exists, return error (must revoke first)
6. Validate nominee email differs from principal email
7. Insert into `nominees` table with status `active`, `nominee_email_verified: true`
8. Send confirmation email to **principal** (you appointed X as nominee)
9. Send confirmation email to **nominee** (you have been appointed as nominee by principal, here's what this means)
10. Audit log via `logDataAccess`

**Response:** `{ success: true, nomineeId: "...", message: "Nominee appointed successfully." }`

#### `GET /api/guest/nominee` — View Current Nominee

**Auth:** OTP session token
**Query:** `?email=...&sessionToken=...`

**Response:**
```typescript
{
  success: true,
  nominee: {
    id: string,
    nomineeName: string,
    nomineeEmail: string,

    relationship: string,
    createdAt: string
  } | null  // null if no active nominee
}
```

#### `DELETE /api/guest/nominee` — Revoke Nominee

**Auth:** OTP session token
**Body:**
```typescript
{
  email: string,
  sessionToken: string
}
```

**Logic:**
1. Zod parse + `sanitizeObject()` on parsed input
2. Verify OTP session
3. Find active nominee for this principal email
4. Update status to `revoked`, set `revoked_at`
5. Send confirmation email to principal (nominee revoked)
6. Send notification email to former nominee (your nomination has been revoked)
7. Audit log

**Response:** `{ success: true, message: "Nominee revoked successfully." }`

#### `POST /api/guest/nominee-claim/send-otp` — Send OTP to Nominee for Claim

**Auth:** None (public endpoint — nominee initiates the flow)
**Rate limit:** `nominee-claim-otp:{ip}` — 3 requests/hour
**Body (Zod-validated + sanitized):**
```typescript
{
  nomineeEmail: string,    // nominee's email
  principalEmail: string   // the data principal's email
}
```

**Logic:**
1. Zod parse + `sanitizeObject()` on parsed input
2. Verify an **active** nominee record exists for `(principalEmail, nomineeEmail)` pair
3. If no nomination found — return generic "If a nomination exists, an OTP will be sent" (don't reveal whether a nomination exists to prevent enumeration)
4. Generate OTP for nominee email, store in `guest_data_sessions` (or separate table)
5. Send OTP to nominee's email
6. Audit log

**Response:** `{ success: true, message: "If a valid nomination exists, an OTP has been sent to the nominee email." }`

#### `POST /api/guest/nominee-claim` — Submit a Nominee Claim

**Auth:** Nominee OTP session token (proves nominee controls their email)
**Rate limit:** `nominee-claim:{ip}` — 2 requests/hour (strict, this is sensitive)
**Content-Type:** `multipart/form-data` (file upload)

**Fields:**
```
nomineeEmail: string       — nominee's email (OTP-verified)
sessionToken: string       — nominee's OTP session token
principalEmail: string     — the data principal's email
claimType: "death" | "incapacity"
actionExport: boolean        — request data export
actionDeletion: boolean      — request data deletion
// at least one must be true
document: File             — PDF, JPEG, or PNG, max 10MB
```

**Logic:**
1. Verify nominee's OTP session token (proves they control the nominee email)
2. Parse multipart form data
3. Zod parse text fields + `sanitizeObject()` on parsed input
4. Verify an **active** nominee record exists for `(principalEmail, nomineeEmail)` pair
5. Validate file: check MIME type (PDF/JPEG/PNG), check magic bytes, enforce 10MB limit
6. Upload document to `nominee-documents` bucket via service client:
   - Path: `{principal_email_hash}/{claim_id}/{uuid}.{ext}`
   - No public URL
7. Insert into `nominee_claims` table:
   - `document_retained_until` = now + 1 year (retention policy)
   - Status: `pending`
8. Send confirmation email to nominee (claim received, will be reviewed)
9. Audit log via `logDataAccess` + `logSecurityEvent`

**Response:** `{ success: true, claimId: "...", message: "Claim submitted. You will be contacted at your email once reviewed." }`

**Security notes:**
- Nominee must verify their email via OTP before submitting a claim — prevents anyone who merely knows the email pair from filing claims
- The send-otp endpoint uses a generic response to prevent nomination enumeration
- Document upload goes through the server (service role), never direct browser-to-storage
- IP + user agent logged for abuse tracking

### Admin Endpoints

#### `GET /api/admin/nominee-claims` — List Claims

**Auth:** `requireRole("admin")`
**Query params:** `?status=pending&email=...&limit=20&offset=0`

**Response:**
```typescript
{
  success: true,
  claims: NomineeClaim[],  // includes nominee name, relationship from joined nominees table
  total: number,
  stats: { pending: number, verified: number, rejected: number, completed: number }
}
```

#### `GET /api/admin/nominee-claims/[id]` — Get Claim Details

**Auth:** `requireRole("admin")`

**Response:** Full claim record + nominee record + principal's orders summary (count, statuses)

#### `GET /api/admin/nominee-claims/[id]/document` — Download Proof Document

**Auth:** `requireRole("admin")`

**Logic:**
1. Fetch claim record
2. Generate a **signed URL** (60-second expiry) from Supabase Storage
3. Return the signed URL (admin's browser fetches directly from storage)

This ensures documents are never exposed publicly and access is always authenticated + audited.

#### `PATCH /api/admin/nominee-claims/[id]` — Process a Claim

**Auth:** `requireRole("admin")` + CSRF token
**Body (Zod-validated + sanitized):**
```typescript
{
  action: "verify" | "reject" | "complete",
  adminNotes?: string
}
```

**Logic:**
1. Zod parse + `sanitizeObject()` on parsed input (particularly `adminNotes`)
2. Verify claim exists and status transition is valid
3. Update claim status, `processed_by`, `processed_at`
4. Send appropriate email + audit log (see below)

**Status transitions:**
```
pending → verified    (admin has reviewed documents, deems claim legitimate)
pending → rejected    (documents insufficient or nomination doesn't match)
verified → completed  (admin has executed the requested export/deletion)
```

**On `complete`:**
- Admin has already manually executed export and/or deletion using existing tools
- This endpoint just marks the claim as completed
- Sends email to nominee: "Your claim has been processed. [Details of action taken]."
- Audit log

**On `reject`:**
- Sends email to nominee: "Your claim could not be verified. [Admin notes with reason]. You may contact our Grievance Officer for further assistance."
- Audit log

---

## Service Layer

### `lib/nominee.ts`

```typescript
// Types
export type NomineeStatus = "active" | "revoked";
export type ClaimType = "death" | "incapacity";
export type ClaimAction = "export" | "deletion" | "both";
export type ClaimStatus = "pending" | "verified" | "rejected" | "completed";

export interface Nominee { ... }
export interface NomineeClaim { ... }

// Appointment functions
export async function appointNominee(params: AppointNomineeParams): Promise<{ nomineeId: string }>
export async function getNomineeByPrincipal(principalEmail: string): Promise<Nominee | null>
export async function revokeNominee(principalEmail: string): Promise<{ success: boolean; message: string }>

// Claim functions
export async function submitNomineeClaim(params: SubmitClaimParams): Promise<{ claimId: string }>
export async function getNomineeClaims(params?: ClaimFilterParams): Promise<{ claims: NomineeClaim[]; total: number }>
export async function getNomineeClaimById(claimId: string): Promise<NomineeClaim | null>
export async function processNomineeClaim(params: ProcessClaimParams): Promise<{ success: boolean; message: string }>
export async function getNomineeClaimStats(): Promise<{ pending: number; verified: number; rejected: number; completed: number }>
```

### `lib/nominee-storage.ts`

```typescript
// Document upload (server-side, service client)
export async function uploadClaimDocument(params: {
  file: Buffer;
  filename: string;
  contentType: string;
  principalEmail: string;
  claimId: string;
}): Promise<{ path: string }>

// Signed URL for admin download
export async function getClaimDocumentUrl(documentPath: string): Promise<{ signedUrl: string }>

// Delete document (for retention cleanup)
export async function deleteClaimDocument(documentPath: string): Promise<{ success: boolean }>
```

---

## Email Templates

### `lib/email.ts` — New Functions

```typescript
// Sent to principal when they appoint a nominee
export async function sendNomineeAppointed(params: {
  principalEmail: string;
  nomineeName: string;
  nomineeEmail: string;
  relationship: string;
}): Promise<boolean>

// Sent to nominee when they are appointed
export async function sendNomineeNotification(params: {
  nomineeEmail: string;
  nomineeName: string;
  principalEmail: string;
  relationship: string;
}): Promise<boolean>

// Sent to principal when nominee is revoked
export async function sendNomineeRevoked(params: {
  principalEmail: string;
  nomineeName: string;
}): Promise<boolean>

// Sent to former nominee when revoked
export async function sendNomineeRevocationNotice(params: {
  nomineeEmail: string;
  nomineeName: string;
  principalEmail: string;
}): Promise<boolean>

// Sent to nominee when claim is received
export async function sendNomineeClaimReceived(params: {
  nomineeEmail: string;
  nomineeName: string;
  claimId: string;
  principalEmail: string;
}): Promise<boolean>

// Sent to nominee when claim is processed (verified+completed or rejected)
export async function sendNomineeClaimProcessed(params: {
  nomineeEmail: string;
  nomineeName: string;
  claimId: string;
  status: "completed" | "rejected";
  actionTaken?: string;    // e.g., "Data exported and sent to your email" / "All data deleted"
  rejectionReason?: string;
}): Promise<boolean>
```

---

## UI Components

### 1. Nominee Appointment Page

**Location:** `app/nominee/page.tsx` — dedicated page, linked from `/my-data` and footer

**Flow (4-step wizard, same pattern as `/my-data` and `/grievance`):**

1. **Step 1 — Email:** Enter principal's email → POST `/api/guest/send-data-otp` (reuse existing OTP flow)
2. **Step 2 — OTP:** Enter 6-digit OTP → POST `/api/guest/verify-data-otp` → get session token
3. **Step 3 — Nominee Status:** After OTP verification, fetch current nominee via GET `/api/guest/nominee`
   - **If no active nominee:** Show appointment form
   - **If active nominee:** Show nominee details (name, email, relationship, date appointed) + "Revoke Nominee" button
4. **Step 4 — Appointment Form** (only if no active nominee):
   - Nominee Name (text, required)
   - Nominee Email (email, required, must differ from principal)

   - Relationship (dropdown: Spouse, Child, Parent, Sibling, Legal Guardian, Other)
   - Brief explainer: "A nominee can request export or deletion of your data in the event of your death or incapacity. An OTP will be sent to the nominee's email for verification."
   - Click "Send OTP to Nominee" → POST `/api/guest/nominee/send-otp`
   - Enter 6-digit OTP received by nominee (nominee needs to share the OTP with the principal, or be present)
   - Click "Confirm Appointment" → POST `/api/guest/nominee` with all fields + nominee OTP
   - Success message with nominee details

**Revocation:** Confirmation modal (similar to cancel-deletion pattern but simpler — no phrase typing needed, just "Are you sure?")

**Link from `/my-data`:** Add a button/link in the Actions Panel on Step 3 — "Manage Nominee" → navigates to `/nominee`. This keeps `/my-data` focused on data access/export/deletion and avoids bloating it.

### 2. Nominee Claim Page

**Location:** `app/nominee-claim/page.tsx` — public page, linked from footer and privacy policy

**Flow (3-step wizard, same pattern as `/my-data`):**
1. **Step 1 — Email:** Enter nominee email + principal email → POST `/api/guest/nominee-claim/send-otp`
   - Generic response regardless of whether nomination exists (prevents enumeration)
2. **Step 2 — OTP:** Enter 6-digit OTP sent to nominee email → POST `/api/guest/verify-data-otp` (reuse existing endpoint or nominee-specific one)
   - On success, receives session token
3. **Step 3 — Claim Form:** (only shown after OTP verified)
   - Claim Type: Death / Incapacity (radio)
   - Action Requested (checkboxes, at least one required):
     - [ ] Export my data
     - [ ] Delete my data
   - Upload Document: file input (PDF, JPEG, PNG, max 10MB)
   - Brief guidance text per claim type:
     - Death: "Please upload a death certificate"
     - Incapacity: "Please upload a medical certificate from a registered medical practitioner, or a court order appointing legal guardianship"
   - Submit → POST `/api/guest/nominee-claim` with session token + file
4. **Success:** "Your claim has been submitted. You will be notified at [nominee email] once it is reviewed."

### 3. Admin Nominee Claims Page

**Location:** `app/admin/nominee-claims/page.tsx` — standalone admin page, linked from admin sidebar/navigation

**Why separate from SecurityDashboard:** SecurityDashboard already has Deletion Requests, Corrections, and Grievances tabs. Nominee claims involve document review and a multi-step verification workflow that's distinct from the other DPDP operations. A dedicated page keeps it focused and avoids further bloating SecurityDashboard.

**Features:**
- Stats cards: Pending / Verified / Rejected / Completed
- Filterable table: claim type, status, date range, email search
- Detail modal on row click:
  - Nominee info (name, email, relationship)
  - Principal email + order count
  - Claim type + actions requested (export / deletion)
  - Document download button (fetches signed URL)
  - Status + admin notes
  - Action buttons: Verify / Reject / Mark Completed (with notes field)
- Link to this page from SecurityDashboard's DPDP checklist for discoverability

### 4. Footer & Privacy Policy Links

- Add `/nominee` and `/nominee-claim` links to footer (alongside My Data, Grievance, etc.)
- Update privacy policy nominee section to link to `/nominee` (appointment) and `/nominee-claim` (claims)
- Update `DataCollectionNotice.tsx` if nominee right is listed (already mentions "nominate" — just needs the links)

---

## Document Retention & Cleanup

### Policy

- Uploaded proof documents are retained for **1 year** after the claim is processed (verified/rejected/completed)
- `document_retained_until` is set on the `nominee_claims` record
- After expiry, the document is deleted from Supabase Storage, and `document_path` is set to `'deleted'`
- The claim record itself is retained indefinitely (it's part of the audit trail — only the uploaded file is deleted)

### Cron Integration

Add a new step to the existing `app/api/cron/process-deletions/route.ts`:

```typescript
// Step N: Clean up expired nominee claim documents
try {
  const expiredClaims = await getExpiredClaimDocuments(); // document_retained_until < now AND document_path != 'deleted'
  for (const claim of expiredClaims) {
    await deleteClaimDocument(claim.document_path);
    await markDocumentDeleted(claim.id);
    results.nomineeDocsDeleted++;
  }
} catch (err) {
  logError(err, { context: "cron_nominee_doc_cleanup_failed" });
}
```

---

## File Inventory

### New Files
| File | Purpose |
|------|---------|
| `lib/nominee.ts` | Service layer — appointment, claims, stats |
| `lib/nominee-storage.ts` | Supabase Storage operations for documents |
| `app/api/guest/nominee/route.ts` | POST (appoint), GET (view), DELETE (revoke) |
| `app/api/guest/nominee/send-otp/route.ts` | POST (send OTP to nominee email for appointment) |
| `app/api/guest/nominee-claim/route.ts` | POST (submit claim with document) |
| `app/api/guest/nominee-claim/send-otp/route.ts` | POST (send OTP to nominee email for claim) |
| `app/api/admin/nominee-claims/route.ts` | GET (list claims with filters + stats) |
| `app/api/admin/nominee-claims/[id]/route.ts` | GET (detail), PATCH (process) |
| `app/api/admin/nominee-claims/[id]/document/route.ts` | GET (signed URL for document download) |
| `app/nominee/page.tsx` | Nominee appointment page (OTP-verified principal) |
| `app/nominee-claim/page.tsx` | Public claim submission page |
| `app/admin/nominee-claims/page.tsx` | Admin nominee claims page |
| `supabase/migrations/20260210120000_nominee_appointments.sql` | DB migration |

### Modified Files
| File | Change |
|------|--------|
| `app/my-data/page.tsx` | Add "Manage Nominee" link/button in Actions Panel |
| `lib/email.ts` | Add 6 new email template functions |
| `components/SecurityDashboard.tsx` | Add link to `/admin/nominee-claims` in DPDP checklist |
| `app/api/cron/process-deletions/route.ts` | Add expired document cleanup step |
| `components/Footer.tsx` | Add Nominee Claim link |
| `app/privacy-policy/page.tsx` | Add link to `/nominee-claim` in nominee section |

---

## Security Considerations

1. **Document upload validation:** Check MIME type + magic bytes (not just file extension). Reject anything that isn't PDF/JPEG/PNG.
2. **Private storage bucket:** `nominee-documents` bucket has no public access. All access via signed URLs (60-second expiry) through admin endpoint.
3. **No nominee self-service:** Nominee never gets direct access to principal's data. Admin mediates all actions.
4. **Rate limiting:** Strict limits on claim submission (2/hour per IP) — this is a sensitive, rarely-used endpoint.
5. **Double OTP verification:** Nominee email is OTP-verified at appointment time (proves email is real and nominee is aware). Nominee email is OTP-verified again at claim time (proves the person submitting the claim actually controls the nominee email). Combined with the nomination record, this creates a strong 3-layer verification chain: principal verified → nominee email verified → claim submitter verified.
6. **Anti-enumeration:** The claim send-otp endpoint returns a generic response regardless of whether a nomination exists, preventing attackers from discovering principal-nominee email pairs.
7. **Audit trail:** Every action (appointment, revocation, claim submission, admin processing, document deletion) is logged via `logDataAccess` + `logSecurityEvent`.
8. **XSS sanitization:** All text inputs go through `sanitizeObject()` after Zod parsing (standard pattern).
9. **CSRF:** Admin PATCH endpoint uses CSRF token (standard for admin mutation endpoints).
10. **Document path isolation:** Documents stored under hashed principal email prefix — prevents path traversal between principals.

---

## Implementation Order

```
1. Database migration (nominees + nominee_claims tables + storage bucket)
2. lib/nominee.ts — appointment service layer (appoint, view, revoke)
3. lib/nominee-storage.ts — document upload/download/delete
4. app/api/guest/nominee/route.ts — appointment endpoints (POST, GET, DELETE)
5. app/my-data/page.tsx — nominee section in Step 3
6. lib/email.ts — all 6 email templates
7. app/api/guest/nominee-claim/route.ts — claim submission with upload
8. app/nominee-claim/page.tsx — public claim page
9. lib/nominee.ts — claim service functions (submit, list, process, stats)
10. app/api/admin/nominee-claims/ — all admin endpoints
11. app/admin/nominee-claims/page.tsx — admin nominee claims page
12. components/SecurityDashboard.tsx — add link to nominee claims page in DPDP checklist
13. app/api/cron/process-deletions/route.ts — document retention cleanup
14. Footer, privacy policy, data collection notice — link updates
15. Testing & verification
```

---

## Compliance Checklist

- [ ] Principal can appoint a nominee (Rule 14)
- [ ] Principal can revoke a nominee
- [ ] Nominee can submit a claim with proof documents
- [ ] Admin can review claims and download proof documents
- [ ] Admin can execute export/deletion on behalf of nominee using existing tools
- [ ] Proof documents stored securely in private bucket
- [ ] Proof documents auto-deleted after 1-year retention period
- [ ] All actions audit-logged
- [ ] Email notifications at every stage
- [ ] Privacy policy references nominee rights and links to claim page
- [ ] Data collection notice mentions nominee right

---

## Sources

- DPDP Act 2023, Section 14(3) — Right to nominate
- DPDP Rules 2025, Rule 14 — Nominee appointment and exercise of rights
- Existing patterns: `lib/correction-request.ts`, `lib/grievance.ts`, `lib/deletion-request.ts`
