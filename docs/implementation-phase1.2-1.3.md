# Implementation Details: Phase 1.2 & 1.3

## Phase 1.2 - Privacy Policy Update

### File Modified

`app/privacy-policy/page.tsx`

### Changes Made

**1. "Last updated" date** (line 20)
Changed from `January 2025` to `February 2026`.

**2. DPDP reference added to Introduction** (Section 1, lines 31-33)
Added a second paragraph declaring compliance with the DPDP Act, 2023 and DPDP Rules, 2025. Identifies Trishikha Organics as a "Data Fiduciary" under the Act.

**3. Data Retention updated from 7 years to 8 years** (Section 6, lines 103-112)
Previously a single paragraph stating "7 years." Now an itemized list with three categories:
- **Order/transaction data** - 8 years from end of financial year (CGST Act Section 36)
- **Non-transactional data** - deleted on request, subject to 14-day cooling-off
- **Inactive accounts** - data may be scheduled for deletion after 1 year inactivity

**4. "Your Rights" expanded to "Your Rights as a Data Principal"** (Section 7, lines 117-131)
Previously generic. Now references specific DPDP rules:
- Right to Access (Rule 14)
- Right to Correction (Rule 14) - mentions correctable fields
- Right to Erasure (Rule 8) - mentions 14-day cooling-off and 8-year tax retention
- Right to Data Portability - mentions JSON format
- Right to Nominate (Rule 14)
- Opt-out

Added link to `/my-data` page alongside the email contact.

**5. New Section 8: Grievance Redressal** (lines 134-149)
- Cites Rule 14 of DPDP Rules, 2025
- States 90-day resolution SLA
- Lists Grievance Officer details (name, email, phone)
- Mentions escalation to Data Protection Board of India

**6. New Section 9: Nominee Appointment** (lines 151-157)
- Cites Rule 14
- Explains nominee rights (exercise data principal rights on death/incapacity)
- Directs to email for appointment

**7. Section renumbering**
Cookies moved from 8 to 10, Changes to Policy from 9 to 11, Contact Us from 10 to 12.

---

## Phase 1.3 - Right to Correction API

### Architecture Overview

```
Guest (browser)                    Admin (dashboard)
     |                                   |
     | POST /api/guest/correct-data      | GET /api/admin/corrections
     | GET  /api/guest/correct-data      | GET /api/admin/corrections/[id]
     |                                   | POST /api/admin/corrections/[id]
     v                                   v
+--------------------------------------------------+
|            lib/correction-request.ts              |
|  createCorrectionRequest()                        |
|  getCorrectionRequestsByEmail()                   |
|  getCorrectionRequests()                          |
|  processCorrectionRequest()                       |
|    └── applyCorrectionToOrders()                  |
|  getCorrectionRequestStats()                      |
+--------------------------------------------------+
     |                    |                |
     v                    v                v
correction_requests   orders table    audit_log
   (new table)        (UPDATE)        (via logDataAccess)
```

### Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/20260204120000_correction_requests.sql` | Database table + RLS |
| `lib/correction-request.ts` | Service layer (all business logic) |
| `app/api/guest/correct-data/route.ts` | Guest-facing API (POST + GET) |
| `app/api/admin/corrections/route.ts` | Admin list endpoint |
| `app/api/admin/corrections/[id]/route.ts` | Admin detail + process endpoint |

---

### Database: `correction_requests` table

**File:** `supabase/migrations/20260204120000_correction_requests.sql`

#### Schema

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid | `gen_random_uuid()` | Primary key |
| `email` | text | - | NOT NULL, requester email |
| `order_id` | uuid | null | FK → `orders(id)` ON DELETE SET NULL. Optional: scope correction to single order |
| `field_name` | text | - | NOT NULL. CHECK: `name`, `email`, `phone`, `address` |
| `current_value` | text | - | NOT NULL, the value before correction |
| `requested_value` | text | - | NOT NULL, the value to change to |
| `status` | text | `'pending'` | CHECK: `pending`, `approved`, `rejected` |
| `admin_notes` | text | null | Admin's reason for approval/rejection |
| `processed_at` | timestamptz | null | When admin processed it |
| `processed_by` | uuid | null | FK → `auth.users(id)`, admin who processed |
| `ip_address` | inet | null | Requester IP |
| `user_agent` | text | null | Requester user-agent |
| `created_at` | timestamptz | `now()` | NOT NULL |
| `updated_at` | timestamptz | `now()` | NOT NULL |

#### Constraints

- `correction_field_name_check` - field_name must be one of: `name`, `email`, `phone`, `address`
- `correction_status_check` - status must be one of: `pending`, `approved`, `rejected`
- `correction_values_differ` - `current_value IS DISTINCT FROM requested_value` (prevents no-op requests)

#### Indexes

- `idx_correction_requests_email` on `email`
- `idx_correction_requests_status` on `status`
- `idx_correction_requests_created_at` on `created_at DESC`
- `idx_correction_requests_order_id` on `order_id`

#### RLS Policies

- **Service role** - full access (FOR ALL)
- **Admin read** - SELECT only, requires `user_role.role IN ('admin', 'super_admin')`
- **Admin update** - UPDATE only, same role check

---

### Service Layer: `lib/correction-request.ts`

#### Types

```typescript
type CorrectionStatus = "pending" | "approved" | "rejected"
type CorrectionFieldName = "name" | "email" | "phone" | "address"
```

#### Field-to-Column Mapping

The `FIELD_TO_COLUMNS` constant maps logical field names to actual `orders` table columns:

| Field | Orders Columns |
|-------|---------------|
| `name` | `guest_first_name`, `guest_last_name` |
| `email` | `guest_email` |
| `phone` | `guest_phone` |
| `address` | `shipping_address`, `shipping_city`, `shipping_state`, `shipping_pincode` |

#### `requested_value` Format by Field

- **name** - Plain string: `"FirstName LastName"`. Split on whitespace; first token = `guest_first_name`, remaining tokens joined = `guest_last_name`. Example: `"Ravi Kumar Patel"` → first=`Ravi`, last=`Kumar Patel`.
- **email** - Plain string: `"newemail@example.com"`. Lowercased and trimmed before applying.
- **phone** - Plain string: `"+919876543210"`. Trimmed before applying.
- **address** - JSON string with keys: `address`, `city`, `state`, `pincode`. Only provided keys are updated (partial update supported). Example: `{"address":"123 New St","city":"Ahmedabad","state":"Gujarat","pincode":"380001"}`.

#### Functions

**`createCorrectionRequest(params)`** (lines 72-123)
- Normalizes email (lowercase, trim)
- Checks for existing pending request for same email + field_name. If found, throws an error (caught as 409 in the route).
- Inserts into `correction_requests`
- Logs `correction_request_created` security event
- Returns `{ requestId }`

**`getCorrectionRequestsByEmail(email)`** (lines 128-149)
- Returns all correction requests for an email, newest first
- Used by the guest GET endpoint

**`getCorrectionRequests(params?)`** (lines 154-198)
- Admin listing with optional filters: `status`, `email` (ilike partial match), `limit`, `offset`
- Returns `{ requests, total }` with exact count for pagination

**`processCorrectionRequest(params)`** (lines 204-285)
- Fetches request, verifies it's still `pending`
- Updates status to `approved` or `rejected` with `processed_at`, `processed_by`, `admin_notes`
- If `approved`, calls `applyCorrectionToOrders()`:
  - On success: logs security event, returns success
  - On failure: **reverts status back to `pending`** with auto-generated admin_notes explaining the revert. Returns failure to admin.

**`applyCorrectionToOrders(request, adminId)`** (lines 290-383, private)
- Builds update object based on field type (see format table above)
- If `order_id` is set on the request: updates only that specific order
- If `order_id` is null: updates **all orders** matching the email
- Logs to audit_log via `logDataAccess()` with `oldData` and `newData` recorded
- Returns `{ success, message }` with count of affected orders

**`getCorrectionRequestStats()`** (lines 388-415)
- Counts requests by status: `{ pending, approved, rejected }`

---

### Guest API: `app/api/guest/correct-data/route.ts`

#### POST `/api/guest/correct-data`

Submit a correction request.

**Request body:**
```json
{
  "email": "user@example.com",
  "sessionToken": "abc123",
  "fieldName": "name",
  "currentValue": "Ravi Patel",
  "requestedValue": "Ravi Kumar Patel",
  "orderId": "uuid-optional"
}
```

**Validation (Zod):**
- `email` - valid email
- `sessionToken` - non-empty string
- `fieldName` - enum: `name`, `email`, `phone`, `address`
- `currentValue` - non-empty string
- `requestedValue` - non-empty string
- `orderId` - optional, must be valid UUID if provided

**Flow:**
1. Rate limit via `apiRateLimit` with key `guest-correct:{ip}`
2. Zod validation (400 on fail)
3. Verify session token against `guest_data_sessions` table (401 on fail)
4. Check session expiry (401 on expired)
5. Verify at least one order exists for the email (404 on no data)
6. If `orderId` provided, verify it belongs to the email (404 on mismatch)
7. Call `createCorrectionRequest()` from service layer
8. Return 200 with `requestId` and status `pending`

**Error responses:**
- 429 - rate limited
- 400 - validation failed
- 401 - invalid/expired session
- 404 - no data found or order mismatch
- 409 - duplicate pending request for same field
- 500 - internal error

**Success response:**
```json
{
  "success": true,
  "message": "Your correction request has been submitted for review.",
  "details": {
    "requestId": "uuid",
    "fieldName": "name",
    "status": "pending",
    "note": "Our team will review your request and apply the correction if approved."
  }
}
```

#### GET `/api/guest/correct-data?email=...&sessionToken=...`

Check status of all correction requests for a verified guest.

**Query params:** `email`, `sessionToken`

**Flow:**
1. Rate limit with key `guest-correct-status:{ip}`
2. Validate params present (400)
3. Verify session token (401)
4. Check session expiry (401)
5. Fetch all requests via `getCorrectionRequestsByEmail()`
6. Return mapped response (camelCase keys)

**Success response:**
```json
{
  "success": true,
  "requests": [
    {
      "id": "uuid",
      "fieldName": "name",
      "currentValue": "Ravi Patel",
      "requestedValue": "Ravi Kumar Patel",
      "status": "approved",
      "adminNotes": "Verified via ID proof",
      "createdAt": "2026-02-04T...",
      "processedAt": "2026-02-05T..."
    }
  ]
}
```

---

### Admin API: `app/api/admin/corrections/route.ts`

#### GET `/api/admin/corrections`

List all correction requests.

**Auth:** Supabase session cookie → `user_role` table check for `admin` or `super_admin`.

**Query params:**
- `status` - filter by `pending`, `approved`, or `rejected`
- `email` - partial match filter (ilike)
- `limit` - default 20
- `offset` - default 0

**Response:**
```json
{
  "success": true,
  "requests": [ /* CorrectionRequest objects with snake_case keys */ ],
  "total": 42,
  "limit": 20,
  "offset": 0,
  "stats": { "pending": 5, "approved": 30, "rejected": 7 }
}
```

---

### Admin API: `app/api/admin/corrections/[id]/route.ts`

#### GET `/api/admin/corrections/{id}`

Get a single correction request by ID.

**Auth:** Same admin role check.

**Response:**
```json
{
  "success": true,
  "request": { /* full CorrectionRequest object */ }
}
```

#### POST `/api/admin/corrections/{id}`

Approve or reject a correction request.

**Request body:**
```json
{
  "action": "approved",
  "adminNotes": "Verified via submitted ID proof"
}
```

**Validation (Zod):**
- `action` - enum: `approved`, `rejected`
- `adminNotes` - optional string

**Flow:**
1. Admin auth check
2. Zod validation (400)
3. Call `processCorrectionRequest()` from service layer
4. If approved: service layer applies correction to orders, audit-logs
5. If correction application fails: service layer auto-reverts status to pending
6. Return success/failure

**Success response:**
```json
{
  "success": true,
  "message": "Correction approved and applied. name updated for user@example.com."
}
```

---

### Audit Trail

Every approved correction is logged to `audit_log` via `logDataAccess()` with:

| Field | Value |
|-------|-------|
| `tableName` | `"orders"` |
| `operation` | `"UPDATE"` |
| `queryType` | `"single"` if order_id set, `"bulk"` if correcting all orders for email |
| `rowCount` | Number of orders updated |
| `userId` | Admin UUID who approved |
| `endpoint` | `"/api/admin/corrections"` |
| `oldData` | `{ fieldName: currentValue }` |
| `newData` | `{ fieldName: requestedValue }` |
| `reason` | `"DPDP right to correction - {field} updated for {email} (request {id})"` |

Security events logged:
- `correction_request_created` - when guest submits request
- `correction_request_processed` - when admin approves/rejects
- `guest_correct_invalid_session` - when session verification fails

---

### Design Decisions & Notes

1. **No email notifications** - unlike deletion requests, correction requests do not send confirmation/status emails. This could be added later.

2. **Approval reverts on failure** - if `applyCorrectionToOrders()` fails after marking the request as `approved`, the status is reverted back to `pending` with an auto-generated admin note. This prevents a state where a request is marked approved but the correction wasn't actually applied.

3. **Address field uses JSON** - the `address` field expects `requested_value` to be a JSON string with keys `address`, `city`, `state`, `pincode`. Only provided keys are updated (partial update). This is different from other fields which are plain strings.

4. **Name splitting** - `"FirstName LastName"` is split on whitespace. The first token goes to `guest_first_name`, everything after goes to `guest_last_name`. This means `"Ravi Kumar Patel"` produces first=`Ravi`, last=`Kumar Patel`.

5. **Scope: single order vs all orders** - if `order_id` is provided, only that order is corrected. If omitted, **all orders** for the email are corrected. The guest API validates that the provided `order_id` belongs to the given email.

6. **Duplicate prevention** - only one pending correction request per email + field_name combination is allowed. If the guest submits a second request for the same field while one is pending, they get a 409 error.

7. **Rate limiting** - uses the general `apiRateLimit` (60 req/min sliding window) with the key prefix `guest-correct:` and `guest-correct-status:`. This is the same rate limiter used across the app, not a dedicated one for corrections.

8. **Admin auth pattern** - follows the same pattern as `app/api/admin/deletion-requests/route.ts`: cookie-based Supabase session → `user_role` table lookup → check for `admin` or `super_admin` role.
