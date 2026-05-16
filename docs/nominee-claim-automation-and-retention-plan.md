# Nominee Claim — Action Automation + Document Retention Plan

**Scope:** Two related changes shipped together:

1. **Automate the actual action** (export / deletion) the nominee requested.
   Today the admin clicks "Complete" but no system action runs — it's an
   honor system. This wires `action_export` and `action_deletion` into real
   automation.
2. **Fix and test the 1-year document retention** for nominee claim proof
   documents. Today the clock starts at submission (contradicting the design
   doc); we move it to processing time, which is meaningful only once #1
   exists.

**State machine change:** `verified` state is eliminated. New flow is
`pending → completed` (admin approves; system executes action and marks
complete) or `pending → rejected`.

---

## 0. Current state — what's actually shipped

| Concern | Status |
|---|---|
| Claim submission with `action_export` / `action_deletion` flags | ✅ Works — `lib/nominee.ts:307` |
| Doc upload to private bucket | ✅ Works — `lib/nominee-storage.ts` |
| Admin review ( reject / complete) | ✅ Works — `lib/nominee.ts:445` |
| **Execution of the requested export** | ❌ **Not wired.** `action_export` is stored and shown as a UI badge but never read by automation. |
| **Execution of the requested deletion** | ❌ **Not wired.** `action_deletion` likewise. |
| Doc retention deadline | ⚠️ Set at **submission time + 1yr**, contradicting design doc (`docs/nominee-appointment-system-plan.md:555` says "1 year after the claim is processed"). |
| Doc cleanup cron | ✅ Works — `app/api/cron/process-deletions/route.ts:218-242` calls `getExpiredClaimDocuments` → `deleteClaimDocument` → `markDocumentDeleted`. |
| Claim row hard-delete after doc tombstone | ❌ Not implemented. Row keeps `principal_email`, `nominee_email`, `ip_address`, `user_agent` indefinitely. Out of scope here — see PII retention audit §C. |

---

## 1. State machine — eliminate `verified`

### 1.1 Rationale

`verified` made sense when "Admin says it looks legit" and "Admin executes the
action" were separate human steps. Once the action is automated, those two
collapse: approving the claim *is* executing the action. A separate "Complete"
button after "Verify" would just be ceremony, and a `verified` row sitting
around with no automation invites stuck states.

### 1.2 New transitions

```
  pending ──approve──► completed
  pending ──reject ───► rejected
```

`completed` and `rejected` are terminal.

### 1.3 Affected schema

`supabase/migrations/20260210120000_nominee_appointments.sql:45-46` has:

```sql
CHECK (status IN ('pending', 'verified', 'rejected', 'completed'))
```

Migration needed to drop `verified` from the CHECK. Backfill any existing
`verified` rows to `pending` (so admin can re-approve under the new flow) — in
this codebase there's likely none yet, but the migration must handle it
defensively.

### 1.4 Affected code

| File | Change |
|---|---|
| `lib/nominee.ts:19` | `ClaimStatus` type: drop `"verified"` |
| `lib/nominee.ts:464-467` | `validTransitions`: replace with `{ pending: ["approve", "reject"] }` |
| `lib/nominee.ts:477-482` | Action → status mapping: `approve → completed`, `reject → rejected` |
| `app/api/admin/nominee-claims/[id]/route.ts:9-10` | Zod enum: `["verify", "reject", "complete"]` → `["approve", "reject"]` |
| `components/NomineeClaimsClient.tsx` | UI: single "Approve" button (was "Verify" + later "Complete"); drop `verified` status badge |
| Any `STATUS_CONFIG` map | Remove `verified` entry |

---

## 2. Action automation

### 2.1 Where it runs

Inside `processNomineeClaim` when `action === "approve"`, before the status
transition to `completed`. If any executor fails, the transition is aborted
and an error is returned to the admin — no partial state.

```
processNomineeClaim({ action: "approve", ... })
  │
  ├─ if action_export    → executeExportForNominee(principalEmail, nomineeEmail, claimId)
  │                          ├─ build JSON via shared builder (reads DB; data must still exist)
  │                          └─ await email send to nominee_email as attachment
  │                              (any failure here aborts the whole transition)
  │
  ├─ if action_deletion  → queueDeletionForNominee(principalEmail, claimId)
  │                          └─ insert deletion_requests row only
  │                                guest_email             = principalEmail
  │                                status                  = "pending"
  │                                scheduled_deletion_at   = now()
  │                                source_nominee_claim_id = claimId
  │                              (existing daily cron at app/api/cron/process-deletions
  │                               will pick this row up and call executeDeletionRequest
  │                               within ≤24h — same retry path as any other deletion)
  │
  └─ update nominee_claims:
       status = "completed"
       processed_at = now
       processed_by = adminId
       document_retained_until = now + 1yr
```

**Why this order:** the export builder reads the principal's data from the
DB, so it must run before any deletion. Queuing deletion (instead of running
it synchronously) means the export is always built against live data, and
the deletion goes through the same retry-on-cron path as guest-originated
deletion requests. The trade-off — principal's data persists for ≤24h after
approval — is documented in the nominee email.

### 2.2 Export builder — shared helper

Refactor `app/api/guest/export-data/route.ts:128-155` (the `exportData`
object) into a shared lib function:

```ts
// new: lib/data-export.ts
export async function buildPrincipalDataExport(email: string): Promise<{
  jsonString: string;     // JSON.stringify(exportData, null, 2)
  filename: string;       // trishikha-data-export-YYYY-MM-DD.json
  ordersCount: number;
}>
```

The guest export route becomes a thin caller. The nominee path uses the same
helper, so the nominee receives **byte-for-byte the same export** a guest
would — single source of truth.

**Cleanup item (do in same PR):** Line 144 still says "7 years"; should say
"8 years" to match `privacy-policy/page.tsx:110` and `lib/deletion-request.ts:24`.

### 2.3 Nominee export email

New email template + sender in `lib/email.ts`:

```ts
export async function sendNomineeDataExport(params: {
  nomineeEmail: string;
  nomineeName: string;
  principalEmail: string;       // shown in body for context
  claimId: string;
  jsonString: string;
  filename: string;
}): Promise<boolean>
```

The JSON is attached directly to the email (it's already plain text, not
sensitive secrets). Subject: "Data export for <principal email> — Trishikha
Organics nominee claim". Body explains: this is the principal's data, you
received it because you submitted nominee claim `<claimId>`, treat
confidentially.

**Alternative considered but rejected:** Upload to a private bucket with a
24-hr signed URL. Rejected because: (a) we'd have a new bucket to manage and
purge, (b) attaching the JSON keeps things consistent with the guest UX (which
also delivers the JSON directly), (c) the export size is bounded by orders
count, well under email attachment limits for any realistic principal.

### 2.4 Nominee deletion path

New helper in `lib/nominee.ts`:

```ts
async function queueDeletionForNominee(params: {
  principalEmail: string;
  claimId: string;
  adminId: string;
}): Promise<{ success: boolean; deletionRequestId?: string; message: string }>
```

It:

1. Inserts a `deletion_requests` row with:
   - `guest_email: principalEmail`
   - `status: "pending"`
   - `scheduled_deletion_at: now()` (immediately due — no cooling-off, since
     admin approval *is* the consent step)
   - `ip_address: null` (admin-originated)
   - `source_nominee_claim_id: claimId` (new column for audit trail)
2. **Does not** call `executeDeletionRequest` synchronously. The existing
   daily cron at `app/api/cron/process-deletions/route.ts` already scans for
   `pending` rows with `scheduled_deletion_at <= now()` and runs them through
   `executeDeletionRequest`. Reuses all that logic for free: paid-order
   anonymization at ₹50k threshold, 8-year tax retention defer, OTP clear,
   review token anonymize, retry-on-transient-failure.
3. Logs via `logSecurityEvent("nominee_deletion_queued", { ... })`.

**Why queue instead of execute synchronously?** Two reasons. (a) **Ordering
safety:** the export builder must read live DB data, so deletion has to run
*after* the export is built and emailed. If we then synchronously ran
deletion at approve time and it failed transiently, the admin would see a
half-done approval. Queuing it routes deletion through the same retry
machinery that already exists for guest-originated requests. (b) **Audit
unification:** `deletion_requests` is the canonical audit record for any
data deletion. Nominee-originated deletions show up in the same admin
dashboard, alongside guest-originated ones, with the linking
`source_nominee_claim_id`.

**What the nominee is told:** the export email body explicitly states that
the principal's data will be permanently deleted within ≤24h (the cron
window). This sets the expectation correctly for the brief lag between
approval and actual deletion.

### 2.5 Failure handling

Execution order inside `processNomineeClaim`:

1. (if `action_export`) build export JSON → email it → `await` SMTP success
2. (if `action_deletion`) insert `deletion_requests` row
3. Update `nominee_claims` to `completed` with retention stamp

Any failure in step 1 or 2 aborts before step 3 — the claim stays
`pending` and no partial state is written.

| Failure | Behavior |
|---|---|
| Export builder throws | Abort. Claim stays `pending`. Step 2 not attempted. Error to admin: "Failed to build export. Try again or contact support." |
| Export email send fails (SMTP error or non-2xx from provider) | Abort. Claim stays `pending`. Step 2 not attempted. Admin can retry — the rebuild will produce the same export. |
| `deletion_requests` insert fails (DB error) | Abort. Claim stays `pending`. **Export has already been sent at this point** — see "operational note" below. Admin retries; the retry re-sends the export and re-attempts the insert. |
| Cron later finds `executeDeletionRequest` returns `failed` for the queued row | The `deletion_requests` row stays at `pending`; the next cron run retries it (existing behavior). The claim is already `completed` — that's correct, the admin's job is done; the deletion subsystem owns retry/escalation from here. |
| Cron later returns `deferred_legal` (principal had paid orders) | The `deletion_requests` row moves to `deferred_legal` for tax retention. The claim is already `completed` — same as above. |

**Operational note on the "insert fails after email sent" case:** this is
a narrow window (a DB-level failure between a successful email send and a
single-row insert), and the worst outcome is that the nominee receives the
export twice on retry. That's preferable to either (a) trying to "unsend"
the email or (b) holding the export until the insert succeeds and risking
loss of the export if the process crashes between them. Idempotency at
the claim level (see §2.6) prevents double-deletion-queueing.

### 2.6 Idempotency

**Approving a claim twice (after first succeeded):** blocked by the status
check at the top of `processNomineeClaim` — once `completed`, no further
transitions are allowed.

**Retry after partial failure (claim still `pending`):** allowed by design,
since the admin needs to recover. Behavior per failure point:

- *Email send failed, no deletion row inserted yet:* retry rebuilds and
  resends the export, then inserts the deletion row, then completes. Clean.
- *Email send succeeded but `deletion_requests` insert failed:* retry
  re-sends the export (the nominee may receive a duplicate — acceptable)
  and re-attempts the insert.
- *Both export and deletion-row insert succeeded but the final claim
  status update failed:* retry will re-send the export and insert a
  **second** `deletion_requests` row for the same claim. Both rows get
  processed by cron — the second cron run finds nothing left to delete
  (already wiped on the first run) and the row completes cleanly.
  **Accepted edge cost:** one extra audit row in `deletion_requests`,
  noisy but harmless. No unique constraint added to enforce this — the
  cron's idempotent behavior is sufficient.

---

## 3. Document retention — fix + automate

### 3.1 Policy (confirmed)

Documents retained for **1 year after the claim reaches a terminal state**
(`completed` or `rejected`). Stamped inside `processNomineeClaim` on the
status transition.

| Claim state | `document_retained_until` |
|---|---|
| `pending` | `NULL` |
| `completed` | `processed_at + 1yr` |
| `rejected` | `processed_at + 1yr` |

NULL is excluded from the cleanup query because Postgres `<` against NULL
yields unknown — pending claims with NULL are never picked up by
`getExpiredClaimDocuments`.

### 3.2 Code changes

**`lib/nominee.ts:307` (`submitNomineeClaim`):** Remove the
`retainUntil = new Date(); retainUntil.setFullYear(...)` block. Drop the
`document_retained_until` field from the insert payload (let it be NULL).

**`lib/nominee.ts:445` (`processNomineeClaim`):** Inside the existing
`.update(...)` call (line 484), add `document_retained_until: retainUntil.toISOString()`
where `retainUntil` is `now + 1yr`.

### 3.3 No backfill migration

Existing `nominee_claims` rows have `document_retained_until = created_at + 1yr`.
Leave them — that's a conservative retention (slightly shorter than the new
policy in the worst case), no data is lost prematurely from the perspective
of the new policy. Document this in the PR description.

### 3.4 Cron — no changes needed

`app/api/cron/process-deletions/route.ts:218-242` already does the right
thing. The cron path is independent of how the row got there and only acts
on the `document_retained_until` value.

### 3.5 Stuck-state backstop — not needed

With `verified` eliminated, a claim can only be stuck in `pending` (admin
never reviewed). Doc retention stays NULL → doc kept indefinitely. We accept
this because: (a) admin SLA monitoring should catch unreviewed claims, and
(b) the doc is still operationally needed for review. Surface stuck-pending
claims in the admin dashboard if it becomes a real issue (deferred).

---

## 4. Migration

```sql
-- new file: supabase/migrations/<timestamp>_nominee_claim_state_machine.sql

-- 1. Eliminate `verified` state
ALTER TABLE nominee_claims DROP CONSTRAINT IF EXISTS nominee_claims_status_check;

-- Backfill any leftover `verified` rows back to pending so admin re-approves
UPDATE nominee_claims SET status = 'pending' WHERE status = 'verified';

ALTER TABLE nominee_claims ADD CONSTRAINT nominee_claims_status_check
  CHECK (status IN ('pending', 'rejected', 'completed'));

-- 2. Link nominee-originated deletion requests to their claim (audit trail).
--    NULL on guest-originated rows. No index — the lookup direction (claim →
--    its deletion request) is a rare audit query, not a hot path.
ALTER TABLE deletion_requests
  ADD COLUMN IF NOT EXISTS source_nominee_claim_id uuid
  REFERENCES nominee_claims(id) ON DELETE SET NULL;

-- Note: document_retained_until is already nullable; no schema change needed there.
```

---

## 5. File-by-file change list

| File | Change | LOC est. |
|---|---|---|
| `supabase/migrations/<ts>_nominee_claim_state_machine.sql` | NEW migration (§4) | ~15 |
| `lib/data-export.ts` | NEW shared builder for principal data export (§2.2) | ~80 |
| `app/api/guest/export-data/route.ts` | Refactor to use shared builder; fix "7 years" → "8 years" | -50, +10 |
| `lib/email.ts` | Add `sendNomineeDataExport` (§2.3) | +60 |
| `lib/nominee.ts` | Remove retention on insert; add retention on transition; drop `verified` from types/transitions; add `queueDeletionForNominee` helper; wire export + deletion-queue into `processNomineeClaim` (export-first ordering) | +120, -20 |
| `app/api/admin/nominee-claims/[id]/route.ts` | Zod enum: `["verify","reject","complete"]` → `["approve","reject"]`; update email template branching | ~20 |
| `components/NomineeClaimsClient.tsx` | UI: single "Approve" button; remove `verified` status; show export-sent / deletion-executed receipt | ~40 |
| `docs/nominee-appointment-system-plan.md:555` | Update retention description from "after the claim is processed (verified/rejected/completed)" to "after the claim is finalized (completed/rejected)" | ~2 |

---

## 6. Test plan

**New test file:** `tests/nominee-claim-automation.test.ts`
**Pattern reference:** `tests/auto-cleanup.test.ts` (chainable Supabase mock)

### 6.1 State machine (Group A)

| Case | Assert |
|---|---|
| A.1 `pending → approve` succeeds | Status moves to `completed`; both action executors invoked when flags set |
| A.2 `pending → reject` succeeds | Status moves to `rejected`; no executor called |
| A.3 Cannot approve already-completed claim | Returns `{ success: false }`; no executor called; no DB update issued |
| A.4 Cannot reject completed claim | Same |
| A.5 Action enum rejected at API boundary | `PATCH` with `action: "verify"` returns 400 (Zod fail) |

### 6.2 Export automation (Group B)

| Case | Assert |
|---|---|
| B.1 `action_export=true, action_deletion=false`, approve | `buildPrincipalDataExport(principalEmail)` called once; `sendNomineeDataExport` called with returned `jsonString` + `filename`; no deletion path invoked; status `completed` |
| B.2 Export builder throws | Status stays `pending`; `sendNomineeDataExport` NOT called; admin sees error message |
| B.3 Email send fails | Status stays `pending`; admin can retry |
| B.4 Shared builder consistency | Snapshot test: output of `buildPrincipalDataExport` matches the JSON returned by `GET /api/guest/export-data` for the same email (modulo `exportedAt`) |

### 6.3 Deletion automation (Group C)

| Case | Assert |
|---|---|
| C.1 `action_deletion=true, action_export=false`, approve | New row inserted into `deletion_requests` with `guest_email = principalEmail`, `status = "pending"`, `scheduled_deletion_at` within ±5s of now, `source_nominee_claim_id = claimId`; `executeDeletionRequest` **NOT** called synchronously; claim status `completed`; export path NOT invoked; `logSecurityEvent("nominee_deletion_queued", ...)` emitted |
| C.2 `deletion_requests` insert fails (DB error) | Claim stays `pending`; export path NOT invoked (this case is action_deletion-only); admin sees error |
| C.3 Approve with `action_deletion=true` returns before cron runs | Claim is already `completed`; `deletion_requests` row sits at `pending` — verify by snapshotting the row immediately after the API call returns |
| C.4 Cron pickup (separate test, against existing cron path) | The existing cron tests already cover `executeDeletionRequest` outcomes (`pending → completed`, `pending → deferred_legal`, `pending → failed`). No new assertion needed here — the contract is "we drop a `pending` row in the same shape any other request uses" |

### 6.4 Both actions requested (Group D)

| Case | Assert |
|---|---|
| D.1 Both flags true, both succeed | Export-first ordering: `buildPrincipalDataExport` → `sendNomineeDataExport` → `deletion_requests` insert → claim update. Verify call order via mock invocation timestamps. Final state: claim `completed`, deletion row `pending`. |
| D.2 Both flags true, email send fails | `buildPrincipalDataExport` called; `sendNomineeDataExport` rejects; no `deletion_requests` insert; claim stays `pending`. Critical assertion: principal data is **not** queued for deletion when the nominee never got their copy. |
| D.3 Both flags true, email succeeds, `deletion_requests` insert fails | Export already delivered (nominee got their copy — this is authorized). Claim stays `pending`. On retry: export rebuilt + re-sent (nominee may receive duplicate — acceptable), insert re-attempted. Assert that retry path produces `completed` with single new deletion row. |
| D.4 Both flags true, export builder throws | Nothing emailed, nothing queued, claim stays `pending`. |

### 6.5 Retention stamping (Group E)

| Case | Assert |
|---|---|
| E.1 Submission leaves retention NULL | Insert payload has `document_retained_until` absent/NULL |
| E.2 Approve stamps retention | Update payload includes `document_retained_until` within ±5s of `now + 365d` (fake timers) |
| E.3 Reject stamps retention | Same as E.2 |
| E.4 Pending claims excluded from `getExpiredClaimDocuments` | Documented via comment referencing Postgres NULL `<` semantics — not directly assertable with mocked query builder |

### 6.6 Cron cleanup (Group F — light, defers to existing path)

The cron flow (`getExpiredClaimDocuments` → `deleteClaimDocument` →
`markDocumentDeleted`) is unchanged from current code. Add only:

| Case | Assert |
|---|---|
| F.1 `getExpiredClaimDocuments` filters | Query chain includes `.lt("document_retained_until", <ISO now>)` AND `.neq("document_path", "deleted")` |
| F.2 Cron orchestrator counts errors | Already implicit in current code — add a smoke test asserting `nomineeDocsDeleted` / `nomineeDocErrors` counters move correctly under mocked sub-call failures |

### 6.7 Setup constraints

Same as the original retention plan:

- Extend `mockSupabase` with `.storage.from(bucket).remove([...])` mock
- `vi.useFakeTimers()` + `vi.setSystemTime` for deterministic
  `document_retained_until` values
- Mock sibling cron lib functions (`notifyAbandonedCheckouts`, etc.) to
  no-ops
- Mock QStash signature verification consistent with other cron tests

---

## 7. Manual e2e checklist

Run in staging after deploying the migration + code changes.

1. **Submit export-only claim**
   - Submit via `/nominee-claim` with `action_export = true`, `action_deletion = false`
   - DB: row has `status = "pending"`, `document_retained_until = NULL`
   - Bucket: doc present

2. **Admin approves export-only**
   - Click "Approve" in `/admin/nominee-claims`
   - DB: `status = "completed"`, `document_retained_until ≈ now + 365d`,
     `processed_at` set
   - Nominee email inbox: receives JSON attachment named
     `trishikha-data-export-YYYY-MM-DD.json`
   - Open the JSON, confirm structure matches what `/api/guest/export-data`
     produces (same shape)

3. **Submit deletion-only claim**
   - Submit with `action_deletion = true`
   - DB: row in `nominee_claims` pending

4. **Admin approves deletion-only**
   - Click "Approve"
   - Immediately after API returns:
     - Claim status: `completed`, `document_retained_until ≈ now + 365d`
     - New row in `deletion_requests` with `source_nominee_claim_id` set,
       `status = "pending"`, `scheduled_deletion_at ≈ now`
     - Principal's `orders`/`otp_session`/etc. rows **still present** (cron
       hasn't run yet)
   - Nominee email: receives "request processed — your deletion will be
     completed within 24h" notification
   - Trigger `POST /api/cron/process-deletions` manually
   - After cron run:
     - `deletion_requests` row: `status = "completed"` (or `deferred_legal`
       if principal had paid orders)
     - Principal's data deleted or anonymized per existing deletion logic

5. **Submit both-actions claim**
   - `action_export = true` AND `action_deletion = true`
   - Approve → confirm immediately:
     - Nominee receives JSON export email (built from live DB, before
       deletion runs)
     - Claim status `completed`
     - `deletion_requests` row inserted, status `pending`
     - Principal's data still in DB
   - Trigger cron → deletion executes; principal's data wiped/anonymized
   - This is the correct ordering: nominee gets the export *of the data we
     held*, then we erase it.

6. **Approve flow blocks on failure**
   - Temporarily break email sending (bad SMTP config) on staging
   - Approve an export-only claim
   - Expect: admin sees error, claim stays `pending`, no
     `document_retained_until` set
   - Restore email, re-approve → succeeds

7. **Reject flow**
   - Submit a claim, admin clicks "Reject"
   - Status `rejected`, retention stamped, no executor invoked, nominee gets
     rejection email

8. **Retention cron**
   - Manually update a `completed` row: `document_retained_until = now() - interval '1 day'`
   - Trigger `POST /api/cron/process-deletions` with valid QStash signature
   - Bucket object removed; row's `document_path = "deleted"`; response
     `nomineeDocsDeleted: 1`

9. **Idempotency**
   - Run cron again — same row not re-processed, `nomineeDocsDeleted: 0`

10. **Pending never purged**
    - `pending` row with `document_retained_until = NULL` is never returned
      by `getExpiredClaimDocuments`, even after a long time

11. **RLS**
    - Anon `SELECT * FROM nominee_claims` → denied/empty
    - Anon `SELECT * FROM deletion_requests WHERE source_nominee_claim_id IS NOT NULL` → denied

---

## 8. Open items / explicit non-goals

- **Hard-delete of `nominee_claims` row** (PII columns: `principal_email`,
  `nominee_email`, `ip_address`, `user_agent`) after some period — not
  addressed here. Currently kept indefinitely as audit trail. Revisit
  separately.
- **Backstop for stuck-pending claims** — surface in admin dashboard as
  operational alert; not in scope for this PR.
- **Backfill of existing rows' `document_retained_until`** — explicit
  no-action; existing rows' submission-time retention stays.
- **Stale "7 years" string in `app/api/guest/export-data/route.ts:144`** —
  fix in same PR while we're refactoring the file.
- **Refactor of `executeDeletionRequest` to accept an email directly** —
  rejected; insert-then-call keeps the `deletion_requests` audit invariant.
- **Significant Data Fiduciary–level controls** (DPIA, audit) — not
  triggered; we're under thresholds (per `docs/dpdp-rules-2025-compliance-plan.md:10-13`).

---

## 9. Acceptance criteria

- [ ] Migration applied; `verified` no longer a valid status; existing
      `verified` rows reset to `pending`
- [ ] `lib/data-export.ts` exists; both `/api/guest/export-data` and the
      nominee approve path use it
- [ ] `processNomineeClaim` invokes the right executor(s) per `action_export`
      / `action_deletion` flags before transitioning to `completed`
- [ ] On any executor failure, claim stays `pending`, no partial state
- [ ] `document_retained_until` is NULL on submit, set to `now + 1yr` on
      `completed` or `rejected`
- [ ] Admin UI shows a single "Approve" button (no more "Verify" / "Complete"
      two-step)
- [ ] `tests/nominee-claim-automation.test.ts` covers Groups A–F
- [ ] Manual e2e checklist §7 run in staging; results pasted into PR
- [ ] PR description notes: migration impact, no-backfill decision, the
      execution-order rationale (export-first, deletion queued to existing
      cron), and the stale "7yr" string fix
