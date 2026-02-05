# Incident Response Implementation Plan

**Created:** 2026-01-30
**Updated:** 2026-02-02
**Status:** Partially Implemented
**Related Document:** [INCIDENT_RESPONSE.md](../INCIDENT_RESPONSE.md)

---

## Executive Summary

Analysis of `INCIDENT_RESPONSE.md` shows the incident response system is **~98% implemented**.

> **✅ Tax Compliance Bug Fixed:** The deletion request implementation now correctly handles paid orders - only OTP fields are cleared, customer data is retained for 8 years per GST Act and Income Tax Act requirements.

**Critical Gaps Identified:**

| Gap | Risk Level | Status |
|-----|------------|--------|
| ~~Deletion anonymizes tax-required fields~~ | **Critical** | ✅ Fixed - now checks for paid orders |
| No deletion request tracking with retention deferral | **Critical** | ✅ Implemented (14-day window + 8-year deferral) |
| No legal retention compliance workflow | **Critical** | ✅ Implemented - defers deletion for paid orders |
| Deletion requests admin dashboard (for execution) | **High** | ✅ API implemented (UI pending) |
| ~~Cron job auto-executes deletions~~ | High | ✅ Fixed - now only marks as eligible |
| Email alerts not triggered on incident creation | High | Missing |
| Cannot identify affected users for bulk incidents | High | ✅ Implemented (Options C+D) |
| No response procedure for `data_deletion_alert` | High | Now documented |
| No response procedure for `bulk_data_export` | Medium | Now documented |
| No response procedure for `data_modification_anomaly` | Medium | Now documented |

**Key Addition:** A comprehensive **DPDP-compliant deletion request system** has been implemented with a 14-day cooling-off window period. Customer data is anonymized (not fully deleted) to preserve order records for tax compliance while removing personally identifiable information.

---

## Current Implementation Status

### Fully Implemented

| Component | File | Description |
|-----------|------|-------------|
| Incident Detection & Management | `lib/incident.ts` | CRUD operations, anomaly detection, threshold-based incident creation |
| Security Event Logging | `lib/logger.ts` | `logSecurityEvent()` + `trackSecurityEvent()` with anomaly detection |
| Breach Notification Emails | `lib/email.ts` | Templates: `sendBreachNotificationUser`, `sendInternalSecurityAlert`, `sendRegulatoryBreachNotification`, `sendDPBBreachNotification` |
| DPDP Audit Logging | `lib/audit.ts` | `logDataAccess()`, `logVendorBreach()`, bulk operation threshold detection |
| IP Blocking System | `lib/ip-blocking.ts` | Whitelist, blocklist, exponential backoff, Redis caching |
| Alert Routing | `lib/alert-routing.ts` | Slack/Discord webhook integration |
| Account Lockout | `lib/auth.ts` | Checks `isAccountLocked()` on every admin request |
| Incidents API | `app/api/admin/incidents/` | GET list, GET detail, PATCH update |
| Account Lock/Unlock API | `app/api/admin/account/` | Lock and unlock endpoints |
| Security Dashboard UI | `components/SecurityDashboard.tsx` | Full admin interface with tabs for incidents, vendor breaches, IP blocking |
| Database Schema | `supabase/migrations/` | `security_incidents`, `audit_log`, `vendor_breach_log`, `ip_blocklist`, `ip_whitelist`, `ip_offense_history` |
| Deletion Requests Table | `supabase/migrations/20260201120000_deletion_requests.sql` | Schema for tracking deletion requests with 14-day window period |
| Deletion Request Service | `lib/deletion-request.ts` | Core functions: `createDeletionRequest`, `cancelDeletionRequest`, `executeDeletionRequest`, `getRequestsDueForExecution`, `getRequestsNeedingReminders` |
| Guest Delete Data API | `app/api/guest/delete-data/route.ts` | POST endpoint for guests to request data deletion |
| Guest Cancel Deletion API | `app/api/guest/cancel-deletion/route.ts` | POST endpoint for guests to cancel pending deletion |
| Guest Get Data API | `app/api/guest/get-data/route.ts` | POST endpoint for guests to view their data and pending deletion status |
| Deletion Cron Job | `app/api/cron/process-deletions/route.ts` | Daily job to execute due deletions and send reminder emails |
| Deletion Email Templates | `lib/email.ts` | `sendDeletionRequestConfirmation`, `sendDeletionReminder`, `sendDeletionCompleted`, `sendDeletionCancelled` |
| My Data Page | `app/my-data/page.tsx` | Customer-facing UI for data access, export, deletion request, and cancellation |

### Gaps Identified

| Gap | Description | Priority |
|-----|-------------|----------|
| Email alerts on incident creation | `sendInternalSecurityAlert()` exists but is never called when incidents are created | High |
| Affected users tracking | No way to track multiple affected users per incident | High |
| Deletion requests admin dashboard | Admin UI to view/manage deletion requests (pending, completed, upcoming) | Medium |
| Regulatory notification trigger | No UI workflow to generate/send DPB/GDPR reports | Medium |
| User breach notification flow | No UI workflow to notify affected customers | Medium |

---

## Affected Users Tracking - Deep Analysis

### The Problem

The current `security_incidents` table only tracks **one user per incident**:

```sql
order_id uuid        -- Single order
guest_email text     -- Single email
admin_user_id uuid   -- Single admin (for admin-related incidents only)
```

**Important Context:**
- There are NO authenticated users in the system
- All customers are guest users (orders contain `guest_email` and `guest_phone`)
- `admin_user_id` is only for admin-related incidents (auth failures, account lockouts)

### Incident Types & Affected Users

| Incident Type | Affected Users | How to Identify |
|---------------|----------------|-----------------|
| `rate_limit_exceeded` | **None** - attacker blocked, no data exposed | N/A |
| `payment_signature_invalid` | Single order's customer | `order_id` already in incident |
| `webhook_signature_invalid` | Single order's customer (if applicable) | `order_id` if present |
| `otp_brute_force` | Single order's customer | `order_id` already in incident |
| `unauthorized_access` | Single order's customer | `order_id` already in incident |
| `admin_auth_failure` | **None** - failed login attempt | N/A |
| `bulk_data_export` | Multiple customers | **Cannot identify** - row IDs not stored |
| `data_deletion_alert` | Multiple customers | **Cannot identify** - data deleted |
| `data_modification_anomaly` | Multiple customers | **Cannot identify** - row IDs not stored |
| Vendor breach (Razorpay/Shiprocket) | Multiple customers | **Can query** by vendor + date range |

### Current Audit Log Limitation

```typescript
// Current audit_log entry
{
  table_name: "orders",
  operation: "SELECT",
  row_count: 150,           // We know HOW MANY
  endpoint: "/api/admin/orders",
  // But we DON'T know WHICH specific orders
}
```

We cannot retroactively identify affected users for bulk operations.

---

## Proposed Solutions

> **Decision: Options C + D will be implemented.**
> - Option C: Query-based identification for vendor breaches (Razorpay/Shiprocket)
> - Option D: `incident_affected_users` table for tracking and notification
> - Over-notification is acceptable when precise identification isn't possible

### Option A: Accept Current Limitation (Minimal Change)

**Approach:**
- Single-order incidents: Already works via `order_id` field
- Bulk incidents: Admin manually investigates based on time range
- Over-notify customers in suspected time window if needed

**Pros:** No code changes needed
**Cons:** Cannot precisely identify affected users for bulk incidents

---

### Option B: Store Affected IDs at Audit Time (Full Tracking) — *Not Selected*

**Approach:** Modify `logDataAccess()` to capture affected order IDs

**Schema Change:**
```sql
ALTER TABLE audit_log
ADD COLUMN affected_order_ids uuid[];
```

**Code Change in `lib/audit.ts`:**
```typescript
export async function logDataAccess(entry: AuditLogEntry & {
  affectedOrderIds?: string[];  // NEW
}): Promise<string | null> {
  // ... existing code ...
  const { data, error } = await supabase
    .from("audit_log")
    .insert({
      // ... existing fields ...
      affected_order_ids: entry.affectedOrderIds || null,  // NEW
    })
}
```

**Usage in API routes:**
```typescript
// When fetching orders, log which ones were accessed
const orders = await supabase.from('orders').select('*').limit(100);

await logDataAccess({
  tableName: 'orders',
  operation: 'SELECT',
  rowCount: orders.data.length,
  affectedOrderIds: orders.data.map(o => o.id),  // Track actual IDs
  endpoint: '/api/admin/orders',
});
```

**Pros:** Full traceability for compliance
**Cons:** Storage overhead, privacy implications (logging which orders were viewed)

---

### Option C: Query-Based Identification for Vendor Breaches — ✅ *Selected*

**Approach:** For vendor breaches, query orders based on date range. All orders use Razorpay (payment) and Shiprocket (shipping) - no vendor-specific fields exist.

**Example for Razorpay breach (payment data exposed):**
```sql
SELECT DISTINCT guest_email, guest_phone, id as order_id
FROM orders
WHERE payment_status IN ('paid', 'pending')
  AND created_at BETWEEN :breach_start AND :breach_end;
```

**Example for Shiprocket breach (shipping/address data exposed):**
```sql
SELECT DISTINCT guest_email, guest_phone, id as order_id
FROM orders
WHERE created_at BETWEEN :breach_start AND :breach_end;
```

**Implementation:**
1. Add "Identify Affected Users" button in SecurityDashboard for vendor breaches
2. Create API endpoint that accepts vendor type + date range
3. Returns list of affected emails for notification

**Pros:** Works well for vendor breaches, no schema changes
**Cons:** All orders in date range are affected (no vendor filtering possible)

---

### Option D: Incident Affected Users Table (Hybrid) — ✅ *Selected*

**New Table:**
```sql
CREATE TABLE incident_affected_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES security_incidents(id) ON DELETE CASCADE,

  -- Affected party (guest order)
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  guest_email text NOT NULL,
  guest_phone text,

  -- What data was potentially exposed
  affected_data_types text[],  -- ['email', 'phone', 'address', 'payment_info']

  -- Notification tracking
  notification_status text DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'sent', 'failed', 'not_required')),
  notified_at timestamptz,
  notification_error text,

  created_at timestamptz DEFAULT now(),

  UNIQUE(incident_id, guest_email)
);

CREATE INDEX idx_incident_affected_users_incident ON incident_affected_users(incident_id);
CREATE INDEX idx_incident_affected_users_status ON incident_affected_users(notification_status);
```

**Workflow:**
1. Incident created → Single row in `security_incidents`
2. Admin clicks "Identify Affected Users" → Runs appropriate query based on incident type
3. Results populated into `incident_affected_users`
4. Admin reviews and clicks "Notify All" → Emails sent, status tracked

**Pros:** Clean separation, notification tracking, works with any identification method
**Cons:** Additional table, requires manual identification step

---

## Recommended Approach

**Phase 1 (Quick Wins):**
1. Implement email alerts on incident creation (`sendInternalSecurityAlert`)

**Phase 2 (DPDP Deletion Requests - 14-Day Window + Tax Compliance): ✅ IMPLEMENTED**
2. ✅ Create `deletion_requests` table and migration
3. ✅ Implement `lib/deletion-request.ts` service (with tax compliance)
4. ✅ Create guest deletion request API with 14-day window
5. ✅ Add guest cancel deletion API
6. ✅ Implement cron job for reminders (marks as eligible, does NOT execute)
7. ✅ Create customer-facing My Data page
8. ✅ Fix tax compliance - paid orders retained 8 years
9. ✅ Add deletion requests admin API (list, execute, bulk-execute, stats)
10. ❌ Add deletion requests admin UI (SecurityDashboard tab)

**Phase 3 (Affected User Tracking - Options C + D): ✅ IMPLEMENTED**
10. ✅ Implement Option C: Query-based identification for vendor breaches
    - `queryAffectedUsersByVendor()` in `lib/incident-affected-users.ts`
    - Razorpay: filters by `payment_status IN ('paid', 'pending')` + date range
    - Shiprocket: filters by date range only
11. ✅ Implement Option D: Create `incident_affected_users` table
    - Migration: `20260202130000_incident_affected_users.sql`
    - Service: `lib/incident-affected-users.ts`
12. ✅ Add API for identifying and notifying affected users
    - `GET/POST /api/admin/incidents/[id]/affected-users`
    - `POST /api/admin/incidents/[id]/affected-users/notify`
13. ✅ Add UI for affected users management (SecurityDashboard)
    - `components/AffectedUsersSection.tsx` - Reusable component
    - Integrated into incident detail modal and vendor breach modal

---

## Implementation Tasks

### Phase 1 Tasks

#### Task 1.1: Auto-send Internal Alerts on Incident Creation
**Priority:** High
**File:** `lib/incident.ts`
**Changes:**
- Import `sendInternalSecurityAlert` from `./email`
- In `createIncident()`, after DB insert, call alert function for high/critical severity
- Make it non-blocking (don't fail incident creation if email fails)

```typescript
// In createIncident(), after successful insert:
if (incident.severity === 'high' || incident.severity === 'critical') {
  sendInternalSecurityAlert(data.id, incident.severity, {
    type: incident.incident_type,
    description: incident.description,
    sourceIp: incident.source_ip,
    endpoint: incident.endpoint,
    orderId: incident.order_id,
  }).catch(err => logError(err, { context: 'incident_alert_failed' }));
}
```

#### Task 1.2: Vendor Breach User Identification API ✅ IMPLEMENTED
**Priority:** High
**Files:**
- `lib/incident-affected-users.ts` - Core service
- `app/api/admin/incidents/[id]/affected-users/route.ts` - API endpoint

**API Endpoints:**
```
GET  /api/admin/incidents/[id]/affected-users?status=pending&limit=50
POST /api/admin/incidents/[id]/affected-users
     Body: { action: "identify", vendorType: "razorpay", breachStartDate, breachEndDate }
     Body: { action: "add", email, phone, affectedDataTypes }
POST /api/admin/incidents/[id]/affected-users/notify
     Body: { action: "notify_all" }
     Body: { action: "notify_single", affectedUserId }
```

**Functions in `lib/incident-affected-users.ts`:**
- `queryAffectedUsersByVendor()` - Option C: query by vendor + date range
- `identifyAffectedUsers()` - Option D: populate incident_affected_users table
- `getAffectedUsers()` - List affected users with filters
- `notifyAffectedUser()` - Send breach notification to single user
- `notifyAllAffectedUsers()` - Bulk notify all pending users

#### Task 1.3: Update SecurityDashboard for Vendor Breaches ✅ IMPLEMENTED
**Priority:** Medium
**Files:**
- `components/SecurityDashboard.tsx` - Integration
- `components/AffectedUsersSection.tsx` - Reusable component

**Features:**
- AffectedUsersSection integrated into incident detail modal
- AffectedUsersSection integrated into vendor breach detail modal (when linked to incident)
- "Identify by Date Range" button with vendor type selection
- "Add Manually" option for individual users
- "Notify All Pending" bulk notification
- Per-user notification status and retry option
- Summary cards showing pending/sent/failed counts

### Phase 2 Tasks (DPDP Deletion Request - 14-Day Window)

#### Task 2.1: Create deletion_requests Table ✅ IMPLEMENTED
**Priority:** Critical
**File:** `supabase/migrations/20260201120000_deletion_requests.sql`
**Schema includes:**
- Guest email tracking
- Status: `pending`, `cancelled`, `completed`, `failed`
- 14-day window tracking: `requested_at`, `scheduled_deletion_at`
- Email reminder tracking: `confirmation_email_sent`, `reminder_day1_sent`, `reminder_day7_sent`, `reminder_day13_sent`, `completion_email_sent`
- Audit fields: `ip_address`, `user_agent`, `orders_count`
- Unique constraint: only one pending request per email

#### Task 2.2: Deletion Request Service ✅ IMPLEMENTED
**Priority:** Critical
**File:** `lib/deletion-request.ts`
**Functions:**
```typescript
// Create a new deletion request (14-day window)
export async function createDeletionRequest(params: CreateDeletionRequestParams): Promise<CreateDeletionRequestResult>

// Cancel a pending deletion request
export async function cancelDeletionRequest(params: { email: string; reason?: string }): Promise<{ success: boolean; cancelledAt: Date | null }>

// Get pending deletion request for an email
export async function getPendingDeletionRequest(email: string): Promise<DeletionRequest | null>

// Execute deletion (anonymize order data) - called by cron job
export async function executeDeletionRequest(requestId: string): Promise<{ success: boolean; ordersAnonymized: number }>

// Get requests due for execution (window expired)
export async function getRequestsDueForExecution(): Promise<DeletionRequest[]>

// Get requests needing reminder emails (day 1, 7, 13)
export async function getRequestsNeedingReminders(): Promise<{ day1: DeletionRequest[]; day7: DeletionRequest[]; day13: DeletionRequest[] }>

// Mark a reminder as sent
export async function markReminderSent(requestId: string, reminderType: "day1" | "day7" | "day13" | "completion" | "confirmation"): Promise<void>

// Calculate days remaining until deletion
export function getDaysRemaining(scheduledDeletionAt: string | Date): number
```

#### Task 2.3: Guest Delete Data API ✅ IMPLEMENTED
**Priority:** Critical
**File:** `app/api/guest/delete-data/route.ts`
**Method:** POST
**Flow:**
1. Validates session token from OTP verification
2. Checks for active orders (pending, booked, shipped) - blocks if present
3. Counts orders to be anonymized
4. Creates deletion request with 14-day window
5. Sends confirmation email
6. Returns scheduled deletion date

**Response:**
```typescript
{
  success: true,
  message: "Deletion request submitted",
  scheduledDeletionDate: "2026-02-16T...",
  windowPeriodDays: 14,
  ordersToBeAnonymized: 3
}
```

#### Task 2.4: Guest Cancel Deletion API ✅ IMPLEMENTED
**Priority:** High
**File:** `app/api/guest/cancel-deletion/route.ts`
**Method:** POST
**Flow:**
1. Requires fresh OTP verification (5 max attempts, 30-min lockout)
2. Cancels pending deletion request
3. Sends cancellation confirmation email

#### Task 2.5: Fix Tax Compliance Bug in Deletion Logic ✅ FIXED
**Priority:** Critical
**Files:** `lib/deletion-request.ts`, `app/api/cron/process-deletions/route.ts`

**Implementation:**
- `executeDeletionRequest()` now checks for paid orders before any deletion
- If paid orders exist: only clears OTP fields, marks as `deferred_legal`, calculates 8-year retention end date
- If no paid orders: deletes all order data
- New status values: `eligible` (ready for admin), `deferred_legal` (has paid orders)
- New functions: `getFinancialYear()`, `calculateRetentionEndDate()`, `markRequestsAsEligible()`

#### Task 2.6: Deletion Cron Job ✅ FIXED
**Priority:** High
**File:** `app/api/cron/process-deletions/route.ts`
**Triggered by:** Upstash QStash (daily)

**Current behavior:**
- ✅ Marks requests as `eligible` when 14-day window expires (does NOT execute)
- ✅ Sends reminder emails on day 1, 7, and 13
- ✅ Does NOT auto-execute deletions - requires admin approval

#### Task 2.7: Customer My Data Page ✅ IMPLEMENTED
**Priority:** High
**File:** `app/my-data/page.tsx`
**Features:**
- Three-step flow: Email → OTP → Data access
- View all orders with items and shipping info
- Export data as JSON
- Request deletion (requires "DELETE MY DATA" confirmation)
- Cancel pending deletion (requires OTP + "CANCEL DELETION" confirmation)
- Shows pending deletion countdown
- DPDP Act compliance information

#### Task 2.8: Deletion Requests Admin API ✅ IMPLEMENTED
**Priority:** High
**Files:**
- `app/api/admin/deletion-requests/route.ts` - GET list with filters
- `app/api/admin/deletion-requests/[id]/route.ts` - GET details, POST execute
- `app/api/admin/deletion-requests/stats/route.ts` - GET statistics
- `app/api/admin/deletion-requests/bulk-execute/route.ts` - POST bulk execute

**API Endpoints:**
```
GET  /api/admin/deletion-requests?status=eligible&email=...&limit=20&offset=0
GET  /api/admin/deletion-requests/[id]
POST /api/admin/deletion-requests/[id]  (execute single)
GET  /api/admin/deletion-requests/stats
POST /api/admin/deletion-requests/bulk-execute  (body: { requestIds: [] })
```

#### Task 2.9: Deletion Requests Admin UI ✅ IMPLEMENTED
**Priority:** Medium
**Files:**
- `components/DeletionRequestsTab.tsx` - Tab component
- `components/SecurityDashboard.tsx` - Integration

**Features:**
- New "Deletion Requests" tab in SecurityDashboard
- Stats cards: Pending, Eligible (action required), Deferred, Completed, Failed, Next 7 Days
- Filter by status and search by email
- Table with: email, status, requested date, scheduled/retention date, orders count
- Checkbox selection for bulk operations
- "Select All Eligible" button
- "Execute Selected" bulk action
- Detail modal with:
  - Request info and dates
  - Order summary (total, paid, unpaid)
  - Associated orders table
  - Tax compliance notice for paid orders
  - Execute deletion button

### Phase 3 Tasks (Affected User Tracking)

#### Task 3.1: Create incident_affected_users Table
**New File:** `supabase/migrations/YYYYMMDD_incident_affected_users.sql`

#### Task 3.2: Notification Tracking API
**New File:** `app/api/admin/incidents/[id]/notify/route.ts`
**Functionality:**
- POST: Send notifications to all pending affected users
- Track success/failure per user

#### Task 3.3: Bulk Notification UI
**File:** `components/SecurityDashboard.tsx`
**Changes:**
- Show notification progress (X/Y sent)
- Retry failed notifications

---

## Detailed Incident Response Procedures

### 1. `bulk_data_export` Incident

**What triggers it:** Admin queries/exports more than `AUDIT_BULK_SELECT_THRESHOLD` (default 100) rows

**Severity:** Medium → High (if unauthorized)

**Response Procedure:**

| Step | Action | Responsible |
|------|--------|-------------|
| 1 | Receive alert via email/Slack | Automated |
| 2 | Review audit_log entry for endpoint, admin user, timestamp | Security Admin |
| 3 | Verify the export was authorized (check with admin who performed it) | Security Admin |
| 4 | If authorized: Document reason, mark as `false_positive` | Security Admin |
| 5 | If unauthorized: Immediately lock admin account | Security Admin |
| 6 | Query exported data scope (see query below) | Security Admin |
| 7 | Assess if personal data was exposed externally | Security Admin |
| 8 | If breach confirmed: Initiate DPB notification workflow | Security Admin |

**Query to assess exported data scope:**
```sql
SELECT
  endpoint,
  row_count,
  admin_user_id,
  created_at,
  request_metadata
FROM audit_log
WHERE id = :incident_audit_log_id;

-- Then query what data was likely in that endpoint at that time
SELECT COUNT(*), MIN(created_at), MAX(created_at)
FROM orders
WHERE created_at <= :export_timestamp;
```

**Containment actions:**
- Lock admin account if unauthorized: `POST /api/admin/account/lock`
- Rotate API keys if external export suspected
- Review admin activity for past 24 hours

---

### 2. `data_deletion_alert` Incident

**What triggers it:** Admin deletes more than `AUDIT_BULK_DELETE_THRESHOLD` (default 10) rows

**Severity:** High → Critical (irreversible data loss)

**⚠️ CRITICAL: Tax Data Retention Requirement**

Under Indian GST law and Income Tax Act, business records must be retained for **8 years** from the relevant assessment year. This includes:
- Invoices and transaction records
- Payment receipts
- Customer order details (name, address, phone for delivery)
- GST invoices and returns

**Response Procedure:**

| Step | Action | Responsible |
|------|--------|-------------|
| 1 | **IMMEDIATE:** Check if deletion is still in progress; abort if possible | Security Admin |
| 2 | Review audit_log for what table/endpoint triggered deletion | Security Admin |
| 3 | Check if tax-relevant data was affected (orders, payments, invoices) | Security Admin |
| 4 | Verify if pre-deletion archive exists (see Archive Workflow below) | Security Admin |
| 5 | If archive missing: Attempt recovery from database backups | Security Admin |
| 6 | Assess compliance impact | Security Admin |
| 7 | If personal data deleted without archive: DPB notification may be required | Security Admin |
| 8 | Document incident thoroughly with recovery status | Security Admin |

**Containment actions:**
- Temporarily revoke DELETE permissions from admin role
- Check Supabase point-in-time recovery options
- Lock admin account pending investigation

---

### 3. `data_modification_anomaly` Incident

**What triggers it:** Admin modifies more than `AUDIT_BULK_UPDATE_THRESHOLD` (default 50) rows

**Severity:** Medium → High (data integrity concern)

**Response Procedure:**

| Step | Action | Responsible |
|------|--------|-------------|
| 1 | Review audit_log for table, operation, row count | Security Admin |
| 2 | Identify which fields were modified (if logged) | Security Admin |
| 3 | Verify modification was authorized (batch update, price change, etc.) | Security Admin |
| 4 | If unauthorized: Lock admin account, assess damage | Security Admin |
| 5 | Query affected records to understand scope | Security Admin |
| 6 | If financial data modified: Cross-check with payment gateway records | Security Admin |
| 7 | Restore from backup if data integrity compromised | Security Admin |

**Query to assess modification scope:**
```sql
-- Check what was modified around the incident time
SELECT *
FROM orders
WHERE updated_at BETWEEN :incident_time - INTERVAL '5 minutes'
                     AND :incident_time + INTERVAL '5 minutes'
ORDER BY updated_at DESC;
```

---

### 4. Vendor Breach Incident (Razorpay/Shiprocket)

**What triggers it:** Vendor notifies of breach, or detected via signature failures

**Severity:** High → Critical (third-party data exposure)

**Response Procedure:**

| Step | Action | Responsible |
|------|--------|-------------|
| 1 | Log vendor breach via `logVendorBreach()` | Security Admin |
| 2 | Obtain breach details from vendor (date range, data types) | Security Admin |
| 3 | Query affected customers (see queries below) | Security Admin |
| 4 | Populate `incident_affected_users` table | Security Admin |
| 5 | Assess risk to affected individuals | Security Admin |
| 6 | Initiate DPB notification (mandatory under DPDP Act) | Security Admin |
| 7 | Notify affected customers via `sendBreachNotificationUser()` | Automated |
| 8 | Document vendor's remediation actions | Security Admin |

**Query affected users for Razorpay breach:**

> **Note:** All orders use Razorpay for payment. No `payment_method` field exists. Filter by date range and payment status only.

```sql
SELECT DISTINCT
  guest_email,
  guest_phone,
  id as order_id,
  created_at,
  total_amount
FROM orders
WHERE payment_status IN ('paid', 'pending')
  AND created_at BETWEEN :breach_start_date AND :breach_end_date;
```

**Query affected users for Shiprocket breach:**

> **Note:** All orders use Shiprocket for shipping. No `shipping_provider` field exists. Filter by date range only.

```sql
SELECT DISTINCT
  guest_email,
  guest_phone,
  shipping_address_line1,
  shipping_address_line2,
  shipping_city,
  shipping_state,
  shipping_pincode,
  id as order_id
FROM orders
WHERE created_at BETWEEN :breach_start_date AND :breach_end_date;
```

---

## Tax Data Retention & Safe Deletion

### Legal Requirements (India)

| Regulation | Retention Period | Data Types |
|------------|------------------|------------|
| GST Act 2017 | **8 years** from relevant assessment year | Invoices, tax records, returns |
| Income Tax Act | **8 years** from end of relevant assessment year | Financial records, transactions |
| Companies Act 2013 | **8 years** | Books of account, financial statements |
| DPDP Act 2023 | Only as long as necessary | Personal data (with consent) |

**Conflict Resolution:** Tax/legal retention requirements **override** DPDP deletion requests. Data principals must be informed that their original records cannot be deleted, modified, or anonymized during the 8-year retention period. Access to their data can be restricted to essential legal/tax purposes only.

### Data Categories & Retention Rules

| Data Category | Can Be Deleted? | Retention Period | Notes |
|---------------|-----------------|------------------|-------|
| Order ID, timestamps | ❌ No | 8 years | Tax record linkage |
| Invoice number, amounts | ❌ No | 8 years | GST compliance |
| GST details (GSTIN, HSN codes) | ❌ No | 8 years | Mandatory |
| Payment transaction IDs | ❌ No | 8 years | Audit trail |
| Customer name | ❌ No | 8 years | Required for invoice validity |
| Email, phone | ❌ No | 8 years | Part of original transaction record |
| Shipping address | ❌ No | 8 years | Required for delivery proof |
| Product details | ❌ No | 8 years | Invoice line items |
| OTP attempts, security logs | ✅ Yes | 1 year | Not tax-relevant |
| Cart data (abandoned) | ✅ Yes | 90 days | No financial record |

### Deletion Request Handling Workflow (✅ IMPLEMENTED)

**Current Implementation: 14-Day Window Period with Anonymization**

The implemented system uses a 14-day cooling-off period before anonymizing customer data. Order records are preserved (for tax compliance) but PII is replaced with anonymized placeholders.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Data Deletion Request                         │
│                    (app/my-data/page.tsx)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: Guest verifies identity via OTP                        │
│  - Submit email → receive OTP → verify OTP                      │
│  - Session token issued for subsequent requests                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: Check for active orders                                │
│  - Blocks deletion if: pending, booked, or shipped orders exist │
│  - User must wait for orders to be delivered/completed          │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      Has active orders?               No active orders
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│ BLOCKED                 │     │ Can proceed             │
│ Must wait for delivery  │     │ with deletion request   │
└─────────────────────────┘     └─────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Create deletion request (14-day window)                │
│  - Entry created in deletion_requests table                     │
│  - scheduled_deletion_at = now + 14 days                        │
│  - Status: 'pending'                                            │
│  - Confirmation email sent                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: Reminder emails (cron job)                             │
│  - Day 1: First reminder with cancel option                     │
│  - Day 7: Mid-point reminder                                    │
│  - Day 13: Final warning (1 day before deletion)                │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      User cancels?                    Window expires
      (within 14 days)                 (Day 14)
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│ CANCELLED               │     │ EXECUTE ANONYMIZATION   │
│ - Status: 'cancelled'   │     │ - Email → anonymized    │
│ - Data preserved        │     │ - Phone → 0000000000    │
│ - Cancellation email    │     │ - Name → "Deleted User" │
└─────────────────────────┘     │ - Address → "Removed"   │
                                │ - OTP data cleared      │
                                │ - Completion email sent │
                                └─────────────────────────┘
```

**✅ Tax Compliance Implemented**

The `lib/deletion-request.ts` now correctly handles tax compliance:

**For orders with `payment_status = 'paid'` (tax-relevant):**

| Field | Action | Reason |
|-------|--------|--------|
| `guest_email` | ✅ Retained | Required on invoice |
| `guest_phone` | ✅ Retained | Required for delivery proof |
| `shipping_*` (name, address) | ✅ Retained | Required for invoice/delivery |
| `billing_*` (name, address) | ✅ Retained | Required for invoice |
| `otp_code`, `otp_*` fields | ✅ Cleared | Not tax-relevant |

**Deletion behavior by scenario:**

| Scenario | Orders Deleted | OTP Cleared | Status | Retention |
|----------|---------------|-------------|--------|-----------|
| No paid orders | All | N/A | `completed` | None |
| Has paid orders | Unpaid only | Yes | `deferred_legal` | 8 years from FY end |

**Implementation in `executeDeletionRequest()`:**
1. Checks for paid orders before any deletion
2. If paid orders exist: clears OTP fields only, calculates retention end date (8 years from FY end)
3. If no paid orders: deletes all order data
4. Unpaid orders are always deleted (no tax obligation)

### `deletion_requests` Table Schema (✅ IMPLEMENTED)

**File:** `supabase/migrations/20260201120000_deletion_requests.sql`

```sql
CREATE TABLE deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Guest identification (all customers are guests)
  guest_email text NOT NULL,

  -- Request status
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'cancelled', 'completed', 'failed')),

  -- Window period tracking (14-day cooling-off)
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_deletion_at timestamptz NOT NULL,  -- requested_at + 14 days
  cancelled_at timestamptz,
  completed_at timestamptz,

  -- Cancellation tracking
  cancellation_reason text,

  -- Notification tracking
  confirmation_email_sent boolean DEFAULT false,
  reminder_day1_sent boolean DEFAULT false,
  reminder_day7_sent boolean DEFAULT false,
  reminder_day13_sent boolean DEFAULT false,
  completion_email_sent boolean DEFAULT false,

  -- Audit trail
  ip_address inet,
  user_agent text,

  -- Metadata
  orders_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX idx_deletion_requests_status ON deletion_requests(status);
CREATE INDEX idx_deletion_requests_scheduled ON deletion_requests(scheduled_deletion_at)
  WHERE status = 'pending';
CREATE INDEX idx_deletion_requests_email ON deletion_requests(guest_email);

-- Only one pending request per email at a time
CREATE UNIQUE INDEX idx_deletion_requests_pending_email ON deletion_requests(guest_email)
  WHERE status = 'pending';

-- RLS policies
ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for cron job)
CREATE POLICY "Service role full access" ON deletion_requests
  FOR ALL USING (auth.role() = 'service_role');

-- Admin can view all deletion requests
CREATE POLICY "Admin read access" ON deletion_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );
```

### ✅ Deletion Requests Admin UI - IMPLEMENTED

**Files:**
- `components/DeletionRequestsTab.tsx` - Main tab component
- `components/SecurityDashboard.tsx` - Integration (new "Deletion Requests" tab)

**Features implemented:**
1. **Stats cards:** Pending, Eligible (action required), Deferred (tax), Completed, Failed, Next 7 Days
2. **Filter and search:** Status dropdown, email search
3. **Table columns:** Checkbox, Email, Status (with days remaining), Requested, Scheduled/Retention, Orders, Actions
4. **Bulk operations:** Select All Eligible, Execute Selected
5. **Detail modal:** Request info, order summary, orders table, tax compliance notice, execute button
6. **Status badges:** Color-coded by status

---

## Data Deletion Response Procedure

When a `data_deletion_alert` incident is triggered:

### Immediate Response (0-15 minutes)

| Step | Action | Command/Query |
|------|--------|---------------|
| 1 | Check if deletion is ongoing | Review active database connections |
| 2 | Identify what was deleted | `SELECT * FROM audit_log WHERE operation = 'DELETE' AND created_at > now() - interval '1 hour'` |
| 3 | Check if tax archive exists | `SELECT * FROM tax_archive WHERE original_order_id IN (...)` |

### If Archive Missing (15-60 minutes)

| Step | Action |
|------|--------|
| 1 | **DO NOT PANIC** - Supabase has point-in-time recovery |
| 2 | Contact Supabase support for backup restoration |
| 3 | Identify backup timestamp needed |
| 4 | Restore deleted data to staging environment |
| 5 | Extract tax-relevant data and archive |
| 6 | Document the incident thoroughly |

### If Archive Exists (Verification)

| Step | Action |
|------|--------|
| 1 | Verify archive completeness (all required fields present) |
| 2 | Verify data integrity (compare hash if available) |
| 3 | Mark incident as resolved with archive reference |
| 4 | Update deletion request status if applicable |

---

## Resolved Questions

1. ~~**Storage vs Privacy:** Should we log which specific orders were accessed in audit_log? (Option B)~~
   **Answer:** Not needed. Using Options C (query-based) and D (incident_affected_users table) instead.

2. ~~**Over-notification:** Is it acceptable to notify a wider range of users when we can't precisely identify affected ones?~~
   **Answer:** Yes, over-notification is acceptable.

3. ~~**Vendor breach criteria:** What fields identify vendor usage?~~
   **Answer:** No fields needed. **All orders use Razorpay (payment) and Shiprocket (shipping)** - these are the only vendors. Vendor breach queries filter by **date range only**.

4. ~~**Deletion request access:** Who besides admins should view deletion requests?~~
   **Answer:** Service role (for cron job reminders) and admins only. RLS policies implemented.

5. ~~**Retention notification:** Should we notify customers when their data becomes eligible for deletion?~~
   **Answer:** Yes, implemented via reminder emails on day 1, 7, and 13.

6. ~~**Automated vs manual deletion:** After window expires, should deletion be automatic or require admin approval?~~
   **Answer:** **Admin approval required.** Cron job sends reminders only. Admin dashboard handles deletion execution. (Requires cron job modification - see note below)

---

## References

- [INCIDENT_RESPONSE.md](../INCIDENT_RESPONSE.md) - Main incident response documentation
- [SECURITY_PLAN.md](../SECURITY_PLAN.md) - Overall security architecture
- `lib/incident.ts` - Core incident management
- `lib/audit.ts` - Audit logging
- `lib/email.ts` - Notification templates (includes deletion-related emails)

### Deletion Request Implementation Files
- `supabase/migrations/20260201120000_deletion_requests.sql` - Database schema
- `supabase/migrations/20260202120000_deletion_requests_tax_compliance.sql` - Tax compliance fields
- `lib/deletion-request.ts` - Core deletion request service (with tax compliance)
- `app/api/guest/delete-data/route.ts` - Guest deletion request API
- `app/api/guest/cancel-deletion/route.ts` - Guest cancel deletion API
- `app/api/guest/get-data/route.ts` - Guest data access API
- `app/api/cron/process-deletions/route.ts` - Cron job (reminders + mark eligible)
- `app/api/admin/deletion-requests/route.ts` - Admin list API
- `app/api/admin/deletion-requests/[id]/route.ts` - Admin get/execute API
- `app/api/admin/deletion-requests/stats/route.ts` - Admin stats API
- `app/api/admin/deletion-requests/bulk-execute/route.ts` - Admin bulk execute API
- `app/my-data/page.tsx` - Customer-facing My Data page

### Affected Users Tracking Implementation Files (Options C + D)
- `supabase/migrations/20260202130000_incident_affected_users.sql` - Database schema
- `lib/incident-affected-users.ts` - Core affected users service
- `app/api/admin/incidents/[id]/affected-users/route.ts` - Identify/list affected users API
- `app/api/admin/incidents/[id]/affected-users/notify/route.ts` - Notify affected users API
