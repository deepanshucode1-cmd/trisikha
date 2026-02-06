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

## Phase 1.3 - Right to Correction

### Architecture Overview

Corrections are **auto-applied immediately** when a guest submits them. No admin approval is required. The `correction_requests` table serves as an audit trail for compliance. Only orders with `order_status = CONFIRMED` are eligible.

```
Guest (browser)                    Admin (dashboard)
     |                                   |
     | /correct-data page               | SecurityDashboard → Corrections tab
     | (OTP verification flow)          | (read-only audit trail)
     |                                   |
     | POST /api/guest/correct-data      | GET /api/admin/corrections
     | GET  /api/guest/correct-data      | GET /api/admin/corrections/[id]
     v                                   v
+--------------------------------------------------+
|            lib/correction-request.ts              |
|  createCorrectionRequest()                        |
|    └── applyCorrectionToOrder() [auto-apply]      |
|  getCorrectionRequestsByEmail()                   |
|  getCorrectionRequests()                          |
|  processCorrectionRequest() [admin override only] |
|  getCorrectionRequestStats()                      |
+--------------------------------------------------+
     |                    |                |
     v                    v                v
correction_requests   orders table    audit_log
   (audit trail)      (UPDATE)        (via logDataAccess)
```

### Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260204120000_correction_requests.sql` | Database table + RLS |
| `supabase/migrations/20260205130000_correction_require_order_id.sql` | Make `order_id` NOT NULL |
| `lib/correction-request.ts` | Service layer (all business logic) |
| `app/api/guest/correct-data/route.ts` | Guest-facing API (POST + GET) |
| `app/api/admin/corrections/route.ts` | Admin list endpoint |
| `app/api/admin/corrections/[id]/route.ts` | Admin detail endpoint |
| `app/correct-data/page.tsx` | Standalone guest correction page with OTP flow |
| `components/CorrectionRequestsTab.tsx` | Admin read-only audit trail tab |

---

### Database: `correction_requests` table

**Migrations:**
- `20260204120000_correction_requests.sql` — creates table, indexes, RLS
- `20260205130000_correction_require_order_id.sql` — makes `order_id` NOT NULL

#### Schema

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid | `gen_random_uuid()` | Primary key |
| `email` | text | - | NOT NULL, requester email |
| `order_id` | uuid | - | **NOT NULL.** FK → `orders(id)` ON DELETE SET NULL. Corrections are always scoped to a single order. |
| `field_name` | text | - | NOT NULL. CHECK: `name`, `phone`, `address` (email is not correctable for security reasons) |
| `current_value` | text | - | NOT NULL, the value before correction |
| `requested_value` | text | - | NOT NULL, the value to change to |
| `status` | text | `'pending'` | CHECK: `pending`, `approved`, `rejected`. In practice, always `approved` on insert (auto-applied). |
| `admin_notes` | text | null | Reserved for admin override notes |
| `processed_at` | timestamptz | null | Stamped on creation (auto-apply) |
| `processed_by` | uuid | null | FK → `auth.users(id)`, null for auto-applied corrections |
| `ip_address` | inet | null | Requester IP |
| `user_agent` | text | null | Requester user-agent |
| `created_at` | timestamptz | `now()` | NOT NULL |
| `updated_at` | timestamptz | `now()` | NOT NULL |

#### Constraints

- `correction_field_name_check` - field_name must be one of: `name`, `phone`, `address` (email is not correctable)
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
type CorrectionFieldName = "name" | "phone" | "address"
// NOTE: "email" is intentionally NOT correctable - it's the identity anchor used for OTP verification
```

#### Field-to-Column Mapping

The `FIELD_TO_COLUMNS` constant maps logical field names to actual `orders` table columns:

| Field | Orders Columns |
|-------|---------------|
| `name` | `guest_first_name`, `guest_last_name` |
| `phone` | `guest_phone` |
| `address` | `shipping_address`, `shipping_city`, `shipping_state`, `shipping_pincode` |

> **Security Note:** Email is intentionally NOT correctable. It serves as the identity anchor used for OTP verification. Allowing email correction would break the identity verification chain and create a security loophole.

#### `requested_value` Format by Field

- **name** - Plain string: `"FirstName LastName"`. Split on whitespace; first token = `guest_first_name`, remaining tokens joined = `guest_last_name`. Example: `"Ravi Kumar Patel"` → first=`Ravi`, last=`Kumar Patel`.
- **phone** - Plain string: `"+919876543210"`. Trimmed before applying.
- **address** - JSON string with keys: `address`, `city`, `state`, `pincode`. Only provided keys are updated (partial update supported). Example: `{"address":"123 New St","city":"Ahmedabad","state":"Gujarat","pincode":"380001"}`.

> **Note:** Email is not correctable (see Security Note above).

#### Functions

**`createCorrectionRequest(params)`**
- `orderId` is **required** (not optional)
- Normalizes email (lowercase, trim)
- Checks for existing correction for same `email + field_name + order_id`. If found, throws 409 error.
- Inserts with `status: "approved"` and `processed_at` stamped (auto-applied)
- Immediately calls `applyCorrectionToOrder()` to apply the change
- If correction fails, **deletes the request** and throws error
- Logs `correction_request_created_and_applied` security event
- Returns `{ requestId, applied: true }`

**`applyCorrectionToOrder(request)`** (private)
- **Validates order status** — fetches order and checks `order_status === 'CONFIRMED'`. Rejects if not CONFIRMED.
- Builds update object based on field type (see format table above)
- Always targets a single order via `.eq("id", request.order_id)`
- Logs to `audit_log` via `logDataAccess()` with `queryType: "single"`, `userId: "system:guest_correction"`, `endpoint: "/api/guest/correct-data"`
- Returns `{ success, message }`

**`getCorrectionRequestsByEmail(email)`**
- Returns all correction requests for an email, newest first
- Used by the guest GET endpoint

**`getCorrectionRequests(params?)`**
- Admin listing with optional filters: `status`, `email` (ilike partial match), `limit`, `offset`
- Returns `{ requests, total }` with exact count for pagination

**`processCorrectionRequest(params)`**
- Kept for backward compatibility — admin override only (e.g., retroactively rejecting a correction for audit purposes)
- Does **not** apply corrections (they are already applied on creation)

**`getCorrectionRequestStats()`**
- Counts requests by status: `{ pending, approved, rejected }`

---

### Guest UI: `app/correct-data/page.tsx`

Standalone page with its own OTP verification flow (same pattern as `/my-data`).

**3-step flow:**

1. **Step 1 (email):** Enter email → send OTP via `/api/guest/send-data-otp`
2. **Step 2 (otp):** Enter 6-digit OTP → verify via `/api/guest/verify-data-otp` → get sessionToken
3. **Step 3 (data):** Shows correctable orders + correction form + correction history

**Step 3 details:**
- Fetches all orders from `/api/guest/get-data`, filters to only show `CONFIRMED` status
- Each order displays current data (name, email, phone, city) and a "Request Correction" button
- Clicking opens an inline form: field dropdown (name/phone/address), auto-populated current value, input for correct value
- Address field provides structured inputs (street, city, state, pincode) instead of raw JSON
- Below the orders: correction history fetched from `GET /api/guest/correct-data`, showing all past corrections with order ID and status
- Cross-links to `/my-data` for data access/export/deletion

**`/my-data` changes:**
- Correction form and state removed
- Link to `/correct-data` added in the "About Your Data Rights" info box

---

### Guest API: `app/api/guest/correct-data/route.ts`

#### POST `/api/guest/correct-data`

Submit a correction and apply it immediately.

**Request body:**
```json
{
  "email": "user@example.com",
  "sessionToken": "abc123",
  "fieldName": "name",
  "currentValue": "Ravi Patel",
  "requestedValue": "Ravi Kumar Patel",
  "orderId": "uuid-required"
}
```

**Validation (Zod):**
- `email` - valid email (this is the requester's identity email, not a correctable field)
- `sessionToken` - non-empty string
- `fieldName` - enum: `name`, `phone`, `address` (email is not correctable)
- `currentValue` - non-empty string
- `requestedValue` - non-empty string
- `orderId` - **required**, must be valid UUID

**Flow:**
1. Rate limit via `apiRateLimit` with key `guest-correct:{ip}`
2. Zod validation (400 on fail)
3. Verify session token against `guest_data_sessions` table (401 on fail)
4. Check session expiry (401 on expired)
5. Verify order belongs to email **and has `order_status = CONFIRMED`** (404 on not found, 400 on wrong status)
6. Call `createCorrectionRequest()` — inserts record and applies correction immediately
7. Return 200 with `requestId`, `orderId`, and status `approved`

**Error responses:**
- 429 - rate limited
- 400 - validation failed or order status is not CONFIRMED
- 401 - invalid/expired session
- 404 - order not found or doesn't belong to email
- 409 - duplicate correction for same field + order
- 500 - internal error

**Success response:**
```json
{
  "success": true,
  "message": "Your correction has been applied successfully.",
  "details": {
    "requestId": "uuid",
    "fieldName": "name",
    "orderId": "uuid",
    "status": "approved"
  }
}
```

#### GET `/api/guest/correct-data?email=...&sessionToken=...`

Get all correction requests for a verified guest.

**Query params:** `email`, `sessionToken`

**Flow:**
1. Rate limit with key `guest-correct-status:{ip}`
2. Validate params present (400)
3. Verify session token (401)
4. Check session expiry (401)
5. Fetch all requests via `getCorrectionRequestsByEmail()`
6. Return mapped response (camelCase keys, includes `orderId`)

**Success response:**
```json
{
  "success": true,
  "requests": [
    {
      "id": "uuid",
      "orderId": "uuid",
      "fieldName": "name",
      "currentValue": "Ravi Patel",
      "requestedValue": "Ravi Kumar Patel",
      "status": "approved",
      "adminNotes": null,
      "createdAt": "2026-02-05T...",
      "processedAt": "2026-02-05T..."
    }
  ]
}
```

---

### Admin UI: `components/CorrectionRequestsTab.tsx`

Read-only audit trail tab in the SecurityDashboard.

- **Info banner** explaining that corrections are auto-applied for CONFIRMED orders
- **Stats cards:** Applied count + Rejected count (no Pending card — corrections don't enter pending state)
- **Filters:** status (All / Applied / Rejected), email search
- **Table:** email + order ID, field, change (strikethrough old → new), status, date, view button
- **Detail modal (read-only):** full correction details, value comparison, processing info, audit info (IP/UA), close button. No approve/reject actions.

---

### Admin API: `app/api/admin/corrections/route.ts`

#### GET `/api/admin/corrections`

List all correction requests (read-only audit trail).

**Auth:** Supabase session cookie → `user_role` table check for `admin` or `super_admin`.

**Query params:**
- `status` - filter by `approved` or `rejected`
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
  "stats": { "pending": 0, "approved": 35, "rejected": 7 }
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

Admin override — retroactively reject a correction for audit purposes. Kept for backward compatibility but not used in the normal flow.

---

### Audit Trail

Every correction is logged to `audit_log` via `logDataAccess()` at the moment it is applied:

| Field | Value |
|-------|-------|
| `tableName` | `"orders"` |
| `operation` | `"UPDATE"` |
| `queryType` | `"single"` (always — corrections are scoped to one order) |
| `rowCount` | 1 |
| `userId` | `"system:guest_correction"` |
| `endpoint` | `"/api/guest/correct-data"` |
| `oldData` | `{ fieldName: currentValue }` |
| `newData` | `{ fieldName: requestedValue }` |
| `reason` | `"DPDP right to correction - {field} updated for {email} on order {orderId} (request {id})"` |

Security events logged:
- `correction_request_created_and_applied` - when guest submits and correction is applied
- `correction_request_processed` - when admin retroactively changes status (override only)
- `guest_correct_invalid_session` - when session verification fails

---

### Eligible Order Statuses

Only `CONFIRMED` orders are eligible for correction.

| Status | Eligible? | Reason |
|--------|-----------|--------|
| `CHECKED_OUT` | No | No resume flow — order is incomplete |
| **`CONFIRMED`** | **Yes** | Order confirmed but not yet shipped — data can still be corrected before dispatch |
| `PICKED_UP` | No | Order shipped — data used for shipping labels |
| `DELIVERED` | No | Order delivered — data used for invoicing, tax records |
| `CANCELLATION_REQUESTED` | No | Order being cancelled |
| `CANCELLED` | No | Order closed |
| `RETURN_REQUESTED` | No | Return in progress |
| `RETURNED` | No | Order closed |

This restriction exists because modifying data on shipped/delivered orders would affect tax-compliant records (8-year CGST Act retention).

---

### Design Decisions & Notes

1. **Email is NOT correctable (security)** - The email field is the identity anchor used for OTP verification. Allowing users to change the email on their orders would break the identity verification chain: a user verifies as alice@example.com via OTP, but could then change the order's email to bob@example.com, effectively "transferring" the order or disassociating themselves from it. This is a security loophole. Name, phone, and address are safe to correct (typos, moved addresses, changed phone numbers).

2. **No admin approval required** - corrections are applied immediately when the guest submits them. The `correction_requests` table serves as an audit trail for DPDP compliance. This avoids unnecessary friction for a straightforward data right.

3. **Order-scoped corrections only** - `order_id` is required (NOT NULL). Bulk correction of all orders for an email was removed to protect historical tax-compliant records. Each correction targets exactly one CONFIRMED order.

4. **CONFIRMED status only** - orders that have been picked up, delivered, or cancelled cannot be corrected. The data on those orders has already been used for shipping, invoicing, or tax filings.

5. **Rollback on failure** - if `applyCorrectionToOrder()` fails after inserting the request, the request row is deleted. This prevents orphaned audit records for corrections that weren't actually applied.

6. **Address field uses JSON** - the `address` field expects `requested_value` to be a JSON string with keys `address`, `city`, `state`, `pincode`. Only provided keys are updated (partial update). The guest UI provides structured inputs that assemble the JSON automatically.

7. **Name splitting** - `"FirstName LastName"` is split on whitespace. The first token goes to `guest_first_name`, everything after goes to `guest_last_name`. This means `"Ravi Kumar Patel"` produces first=`Ravi`, last=`Kumar Patel`.

8. **Duplicate prevention** - only one correction per `email + field_name + order_id` combination is allowed (regardless of status). If the guest already corrected a field on an order, they cannot submit another correction for the same field on the same order.

9. **Standalone page** - corrections have their own page (`/correct-data`) with a separate OTP flow, rather than being embedded in `/my-data`. This keeps the data access page focused and avoids confusion between viewing data and modifying it.

10. **No email notifications** - unlike deletion requests, correction requests do not send confirmation/status emails. This could be added later.

11. **Rate limiting** - uses the general `apiRateLimit` (60 req/min sliding window) with the key prefix `guest-correct:` and `guest-correct-status:`.

12. **Admin auth pattern** - follows the same pattern as `app/api/admin/deletion-requests/route.ts`: cookie-based Supabase session → `user_role` table lookup → check for `admin` or `super_admin` role.
