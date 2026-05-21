# Grievance Acceptance Workflow Plan

**Scope:** Replace the current admin-driven "resolved → closed" terminal flow
with a two-way conversation that requires explicit user consent to close. The
user can accept a resolution, dispute it (kicking the grievance back to admin),
or stay silent (in which case a 30-day timer auto-closes with reminder
emails). All rounds are captured as an append-only message thread.

**Drivers:**
- DPDP Rule 14(3) is about the *data principal's* satisfaction, not the
  admin's queue management. Today admins can declare a grievance closed
  without principal involvement.
- Audit defensibility: a single overwriting `resolution_notes` field
  destroys the back-and-forth a regulator would want to see.

**Decisions already taken** (via planning Q&A on 2026-05-17):
- Message shape: **thread table** (`grievance_messages`)
- State machine: **explicit `awaiting_user_response`** state
- SLA clock: **single 90-day clock from submission** (no pause, no reset)
- Auto-close: **day-14 reminder, day-30 auto-close** on user silence
- Rollout: **big-bang single PR** — migration + service + API + UI + cron + emails ship together (avoids inconsistent intermediate state where schema is ahead of code)
- Legacy columns: **drop entirely** (staging-only, no production data to preserve). `resolved_at`, `resolved_by`, `resolution_notes`, `admin_notes` are removed by the migration. The message thread is now the single source of truth for all per-grievance text content. Admin no longer has a private internal-notes field — operational commentary lives as admin messages in the thread.
- Indexing: **single composite** `(grievance_id, created_at)` only — no partial index on `anonymised_at IS NULL` (the parent-anonymisation pass filters by `grievance_id IN (...)`, which the composite already serves)

---

## 1. State machine

```
                ┌────────── dispute (T6) ──────┐
                ▼                              │
   open ──► in_progress ──► awaiting_user_response ──► closed
     │           │                ▲    │                  ▲
     │           │                │    └── user accepts (T5)
     │           └─ T4a proposes_close = true              │
     │                                                    │
     └─── T4b proposes_close = true (skip-step) ───┐       │
                                                  │       │
                                                  ▼       │
                                       awaiting_user_response
                                                          │
                  day-30 silence cron (T7) ───────────────┤
                  admin force-close (T8) ─────────────────┘
                  (from any non-closed; with reason)
```

**Transition table.** "Silence clock" columns (`awaiting_since`,
`silence_reminder_sent_at`) drive the day-14 reminder and day-30 auto-close
crons; every admin communication while `awaiting_user_response` resets
them, so the silence clock measures time-since-last-admin-touch, not
time-since-first-resolution.

| T#  | From                       | To                         | Trigger                                              | `awaiting_since`    | `silence_reminder_sent_at` |
|-----|----------------------------|----------------------------|------------------------------------------------------|---------------------|----------------------------|
| T1  | (insert)                   | `open`                     | User submits via `POST /api/guest/grievance`         | NULL                | NULL                       |
| T2  | `open`                     | `in_progress`              | Admin posts clarification (proposes_close=false)                   | unchanged (NULL)    | unchanged (NULL)           |
| T3  | `in_progress`              | `in_progress`              | Admin posts clarification (proposes_close=false)                   | unchanged (NULL)    | unchanged (NULL)           |
| T4a | `in_progress`              | `awaiting_user_response`   | Admin posts `proposes_close=true`                     | now()               | NULL                       |
| T4b | `open`                     | `awaiting_user_response`   | Admin posts `proposes_close=true` (skip-step)         | now()               | NULL                       |
| T4c | `awaiting_user_response`   | `awaiting_user_response`   | Admin re-posts `proposes_close=true`                  | **reset to now()**  | **NULL**                   |
| T9  | `awaiting_user_response`   | `awaiting_user_response`   | Admin posts clarification mid-await (proposes_close=false)             | **reset to now()**  | **NULL**                   |
| T5  | `awaiting_user_response`   | `closed`                   | User accepts (`POST .../accept`)                     | unchanged           | unchanged                  |
| T6  | `awaiting_user_response`   | `in_progress`              | User disputes (`POST .../dispute`)                   | cleared to NULL     | cleared to NULL            |
| T7  | `awaiting_user_response`   | `closed`                   | Day-30 silence cron                                  | unchanged           | unchanged                  |
| T8  | open / in_progress / awaiting_user_response | `closed`     | Admin force-close (PATCH, with reason ≥20 chars)     | unchanged           | unchanged                  |

**Key invariants:**

- `closed` is the only terminal state. `resolved` is **removed** from the enum.
- T4b (skip-step) lets admin go from `open` directly to
  `awaiting_user_response` when admin has an immediate closure proposal
  ready. Avoids forcing a procedural no-op acknowledgement.
- T4c and T9 keep the status unchanged but **reset both silence-clock
  fields** so day-14 reminder and day-30 auto-close measure from the most
  recent admin touch. Without this, a clarifying note from admin on day 10
  would still let auto-close fire on day 30 (counting from the original
  closure proposal) — wrong, the user is actively being communicated with.
- "Time to first closure proposal" — if needed as a metric — derives from
  `MIN(grievance_messages.created_at) WHERE grievance_id = $1 AND
  proposes_close = true`. No denormalised column on `grievances`.
- SLA clock (`sla_deadline`) is independent: 90 days from `created_at`,
  never paused, never reset. See §7.

---

## 2. Schema changes

**Target migration filename:** `supabase/migrations/20260517150000_grievance_acceptance_workflow.sql`

### 2.1 New table `grievance_messages`

```sql
CREATE TABLE grievance_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id uuid NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  author_role text NOT NULL CHECK (author_role IN ('user', 'admin')),
  author_id uuid REFERENCES auth.users(id),   -- NULL for user messages
  body text,                                  -- nullable: cron may anonymise
  proposes_close boolean NOT NULL DEFAULT false,
  anonymised_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Trishikha is guest-only: guests have no auth.users row, so user
  -- messages carry author_id = NULL. Admin messages must always carry an
  -- author_id. This CHECK catches code bugs at write time (e.g. an admin
  -- INSERT that forgets to set author_id would produce an ambiguous row
  -- that looks like a guest message in the thread UI).
  CONSTRAINT grievance_messages_author_role_id_consistency CHECK (
    (author_role = 'user'  AND author_id IS NULL) OR
    (author_role = 'admin' AND author_id IS NOT NULL)
  )
);

CREATE INDEX idx_grievance_messages_grievance ON grievance_messages(grievance_id, created_at);
-- RLS: service role full access; admin SELECT + INSERT (mirroring grievances policies).
```

`proposes_close=true` is what flips the grievance to
`awaiting_user_response`. Admins post other messages without that flag for
clarification rounds.

**Identity model (Trishikha is guest-only):**

| `author_role` | `author_id` | Source of identity |
|---|---|---|
| `'user'` | `NULL` | OTP-verified email on `grievances.email`, checked at the API endpoint against the verified session token |
| `'admin'` | `auth.users.id` | Supabase auth session via `requireRole('admin')` |

The CHECK constraint above enforces this contract at the DB level. The
constraint does NOT enforce that the right guest is posting — that's still
the API endpoint's job, same trust model as the existing
`/api/guest/grievance` endpoints. For audit logging on guest messages,
use the existing sentinel `userId: "system:guest_grievance"`
(`lib/grievance.ts:104`).

### 2.2 `grievances` table changes

Order of operations inside the migration matters: existing `resolved` rows
must be re-stamped to `closed` **before** the CHECK constraint is replaced,
otherwise the new constraint rejects them.

```sql
-- Step 1: add the new nullable columns first so step 2 can populate them.
ALTER TABLE grievances
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by_role text CHECK (closed_by_role IN ('user', 'admin', 'auto_silence')),
  ADD COLUMN awaiting_since timestamptz,         -- last transition INTO awaiting_user_response
  ADD COLUMN silence_reminder_sent_at timestamptz,
  ADD COLUMN force_close_reason text;

-- Step 2: backfill `closed_at` / `closed_by_role` for ALL terminal rows
--   (both legacy 'resolved' and existing 'closed'), then re-stamp
--   'resolved' rows to 'closed' so the constraint swap below succeeds.
--   `resolved_at` is set on both terminal transitions by the old service
--   (lib/grievance.ts:254-262), so it's the right source.
UPDATE grievances
SET closed_at = COALESCE(resolved_at, updated_at),
    closed_by_role = 'admin'
WHERE status IN ('resolved', 'closed')
  AND closed_at IS NULL;

UPDATE grievances
SET status = 'closed', updated_at = now()
WHERE status = 'resolved';

-- Step 3: swap the CHECK constraint — only safe after Step 2 clears 'resolved'.
ALTER TABLE grievances DROP CONSTRAINT grievance_status_check;
ALTER TABLE grievances ADD CONSTRAINT grievance_status_check
  CHECK (status IN ('open', 'in_progress', 'awaiting_user_response', 'closed'));

-- Step 3b: drop the four legacy columns. Staging-only — no production data
-- to preserve. closed_at + closed_by_role + the message thread cover
-- everything they did.
ALTER TABLE grievances DROP COLUMN resolved_at;
ALTER TABLE grievances DROP COLUMN resolved_by;
ALTER TABLE grievances DROP COLUMN resolution_notes;
ALTER TABLE grievances DROP COLUMN admin_notes;
```

### 2.3 Data migration for existing rows

| Existing state | Target state | Rationale |
|---|---|---|
| `status = 'resolved'` | `status = 'closed'`, `closed_at = COALESCE(resolved_at, updated_at)`, `closed_by_role = 'admin'` | Pre-existing resolutions had no consent mechanism; treat as legacy admin-closed. Falls back to `updated_at` for any malformed row where `resolved_at` is unexpectedly null. |
| `status = 'closed'` | `closed_at = COALESCE(resolved_at, updated_at)`, `closed_by_role = 'admin'` | Old service stamped `resolved_at` for both `resolved` and `closed` transitions (`lib/grievance.ts:254-262`), so it's the right source. Required so the new anonymisation cron predicate (`closed_at < cutoff`) catches legacy-closed rows. |
| `status IN ('open', 'in_progress')` | unchanged | Active, will follow new flow going forward. |
| `resolution_notes`, `admin_notes`, `resolved_at`, `resolved_by` | **Dropped** | Staging-only; no production data to preserve. The message thread + `closed_at` + `closed_by_role` cover everything they did. UI renders only the thread (no fallback path needed). |

---

## 3. API surface

### 3.1 Guest endpoints (new)

All require the same OTP-verified session token used by the existing
`/api/guest/grievance` flow. Endpoints assert
`grievance.email === verifiedEmail` before any write.

#### `POST /api/guest/grievance/[id]/accept`

Body: `{ sessionToken }`

Valid only from `awaiting_user_response`. Implements **T5**.

```
validate OTP session → email
load grievance
assert grievance.email === verifiedEmail        (else 403)
assert grievance.status === 'awaiting_user_response'  (else 409 "cannot accept in current state")

UPDATE grievances SET
  status = 'closed',
  closed_at = now(),
  closed_by_role = 'user',
  updated_at = now()
WHERE id = $1
sendGrievanceAccepted(admin)
```

| Current status | Outcome |
|---|---|
| `open` | 409 — nothing to accept |
| `in_progress` | 409 — no closure proposed |
| `awaiting_user_response` | ✅ T5 |
| `closed` | 409 — already terminal |

#### `POST /api/guest/grievance/[id]/dispute`

Body: `{ sessionToken, body }` — `body` is 10–2000 chars, sanitised.

Valid only from `awaiting_user_response`. Implements **T6**.

```
rate-limit (3 / hour / grievance)                  (else 429)
validate body length + sanitize
validate OTP session → email
load grievance
assert grievance.email === verifiedEmail            (else 403)
assert grievance.status === 'awaiting_user_response' (else 409)

INSERT grievance_messages (
  grievance_id, author_role='user', author_id=NULL, body, proposes_close=false
)
UPDATE grievances SET
  status = 'in_progress',
  awaiting_since = NULL,
  silence_reminder_sent_at = NULL,   -- so the next closure proposal starts a fresh silence cycle
  updated_at = now()
WHERE id = $1
sendGrievanceDisputeReceived(admin)
```

Same valid-state matrix as accept.

### 3.2 Admin endpoints

#### `POST /api/admin/grievances/[id]/message` *(new)*

Body: `{ body, proposesClose }` — `body` is 1–5000 chars, sanitised.

Posts an admin message and applies the transition implied by the post
(T2, T3, T4a, T4b, T4c, or T9). Rejected on a `closed` grievance.

```
requireRole('admin')
sanitize body, validate length
load grievance
assert grievance.status !== 'closed'   (else 409)

INSERT grievance_messages (
  grievance_id, author_role='admin', author_id=user.id, body, proposes_close=proposesClose
)

if (proposesClose) {                                // T4a / T4b / T4c
  newStatus = 'awaiting_user_response'
  awaiting_since = now()
  silence_reminder_sent_at = NULL
}
else if (status === 'open')                         // T2
  newStatus = 'in_progress'
else if (status === 'in_progress')                  // T3 — no-op
  newStatus = 'in_progress'
else if (status === 'awaiting_user_response') {     // T9 — clarification, silence clock resets
  newStatus = 'awaiting_user_response'
  awaiting_since = now()
  silence_reminder_sent_at = NULL
}
// closed_at is intentionally absent — this endpoint never transitions to
// closed (that happens via accept / force-close / silence-cron paths).

UPDATE grievances SET
  status, awaiting_since, silence_reminder_sent_at, updated_at
WHERE id = $1

sendGrievanceClosureProposed(user)   if proposesClose
sendGrievanceAdminReply(user)         otherwise
```

#### `PATCH /api/admin/grievances/[id]` *(modified)*

Body: `{ priority?, forceClose?, forceCloseReason? }` — status is **never**
writable here. Implements **T8** when `forceClose=true`.

```
requireRole('admin')
load grievance

if (forceClose) {
  assert forceCloseReason exists and length >= 20   (else 400)
  assert grievance.status !== 'closed'              (else 409 — already closed)

  UPDATE grievances SET
    status = 'closed',
    closed_at = now(),
    closed_by_role = 'admin',
    force_close_reason = forceCloseReason,
    updated_at = now()
  WHERE id = $1
  sendGrievanceForceClosed(user)
}
else if (priority) {
  UPDATE grievances SET priority = $1, updated_at = now() WHERE id = $1
}
```

The pre-existing `status` and `resolutionNotes` fields are **removed**
from the request schema. Any client that still sends them gets a 400 from
Zod parsing.

### 3.3 Validation

- User dispute body: `z.string().min(10).max(2000)` + `sanitizeObject`
- Admin message body: `z.string().min(1).max(5000)` + `sanitizeObject`
- Per-grievance rate-limit on user actions (e.g. max 3 disputes per
  grievance per hour) to prevent thread-flooding

---

## 4. Cron additions (extending `/api/cron/process-deletions`)

Both silence-clock crons measure from `awaiting_since`, which is reset on
every admin communication (T4a/T4b/T4c/T9). So "day 14" really means
"14 days since the last admin touch", not "14 days since the first
closure proposal". User-side disputes (T6) clear `awaiting_since`
entirely, so the clock restarts only when admin posts a new closure
proposal.

### 4.1 Silence reminder (day 14)

For grievances with `status='awaiting_user_response'` and `awaiting_since <
now() - 14 days` and `silence_reminder_sent_at IS NULL`:
- Send `sendGrievanceSilenceReminder` email to the user
- Set `silence_reminder_sent_at = now()`

The `silence_reminder_sent_at IS NULL` guard is what makes T4c/T9 (admin
re-touch) trigger a fresh reminder: the reset of
`silence_reminder_sent_at` to NULL re-opens the row for the cron.

### 4.2 Auto-close on silence (day 30)

For grievances with `status='awaiting_user_response'` and `awaiting_since <
now() - 30 days`:
- Transition to `closed`, `closed_at=now()`, `closed_by_role='auto_silence'`
- Email user (`sendGrievanceAutoClosed`) and admin

Race window with admin reply: cron runs daily; if admin posts T4c/T9
between cron starts and finishes, the row's `awaiting_since` resets and
the next cron iteration will not auto-close. Accepted ≤24h race.

### 4.3 Anonymisation cron (replaces 2.A.4 logic)

**Rule of thumb for what to anonymise:** only principal-authored content.
Admin-authored operational records (`force_close_reason` and admin reply
bodies in the thread) are the documented trail of *our* decisions —
anonymising them would destroy the exact audit DPDP grievance rules expect
us to keep. They stay intact. (`admin_notes` and `resolution_notes` were
dropped in 20260517150000 — see §2.2 — so this section no longer mentions
them.)

The previously-shipped `anonymiseStaleGrievances` predicate must be
updated:

**Before** (already in `lib/auto-cleanup.ts`):
```ts
.in("status", ["resolved", "closed"])
.lt("resolved_at", cutoff)
```

**After:**
```ts
.eq("status", "closed")
.lt("closed_at", cutoff)
```

Two passes per cycle:

1. **Anonymise the grievance row** (principal PII columns only):
   `email`, `subject`, `description`, `ip_address`, `user_agent`.
   **Not** anonymised: `admin_notes`, `resolution_notes`,
   `force_close_reason` (admin-authored, audit trail).

2. **Anonymise user-authored messages in the thread**:
   ```sql
   UPDATE grievance_messages
   SET body = NULL, anonymised_at = now()
   WHERE grievance_id IN (just-anonymised grievance ids)
     AND author_role = 'user'
     AND anonymised_at IS NULL
   ```
   The `author_role='user'` filter is reliable because the
   `grievance_messages_author_role_id_consistency` CHECK constraint (§2.1)
   makes role/id pairs unambiguous. Admin-authored rows
   (`author_role='admin'`) are **not** touched — same reasoning as
   `admin_notes` / `resolution_notes`.

90-day clock measured from `closed_at` (was `resolved_at`).

**Edge case noted, not fixed in this plan:** an admin reply that quotes
the user's content back ("Thank you for your concern about the address
change at 123 Main St") becomes second-hand PII we don't anonymise. Same
shape as `audit_log.oldData` retaining principal values. This is an admin
content-policy issue, not a schema issue. Revisit if quoting patterns
become common.

---

## 5. Email templates (new)

| Function | Recipient | When |
|---|---|---|
| `sendGrievanceClosureProposed` | User | Admin posts `proposes_close=true`. Body includes accept/dispute CTA links to `/grievance` (signed). |
| `sendGrievanceAdminReply` | User | Admin posts a clarification (proposes_close=false). |
| `sendGrievanceDisputeReceived` | Admin (configured grievance officer) | User disputes. |
| `sendGrievanceAccepted` | Admin | User accepts; grievance closed. |
| `sendGrievanceSilenceReminder` | User | Day 14 of silence after admin's closure proposal. |
| `sendGrievanceAutoClosed` | User + admin | Day 30 of silence; auto-closed. |
| `sendGrievanceForceClosed` | User | Admin force-closed; body includes reason. |

The existing `sendGrievanceResolved` is removed (its trigger event no longer
exists in the new state machine).

---

## 6. UI changes

### 6.1 `/grievance` page (user-facing)

After OTP verification, the per-grievance view gains a thread:
- Message list in chronological order, with author role badges
- When status is `awaiting_user_response`:
  - "Accept and close" button → POST `/api/guest/grievance/[id]/accept`
  - "I want to follow up" → opens a text area + Submit → POST `.../dispute`
- When status is `closed`: read-only banner with `closed_by_role` and date
- When status is `in_progress` / `open`: read-only thread, no input

### 6.2 `components/GrievancesTab.tsx` (admin)

Detail modal gains:
- Full message thread inline (admin and user posts visible)
- Reply text area + Submit button
- Checkbox: "Propose to close" (controls `proposes_close`)
- Force-close button → modal asking for `force_close_reason`
- Status filter dropdown updated to new enum values

The status `<select>` in the existing edit form is **removed** — status is
now derived from message actions, not directly settable.

### 6.3 Empty-thread state

For active grievances that haven't been touched by admin yet (status =
`open`), the message thread is empty. Show "No correspondence yet" in both
admin and guest UIs. No legacy fallback path — `resolution_notes` and
`admin_notes` were dropped in 20260517150000.

---

## 7. SLA tracking

Per the user's decision, the SLA clock is a single 90-day timer from
`created_at`. No changes needed to `sla_deadline` or the existing overdue
stats logic. `awaiting_user_response` rows still count against admin SLA
even when the ball is with the user — this is intentional and defensible.

---

## 8. Implementation order

Per the §0 big-bang decision, all of the steps below ship in a single
commit. Within that commit they are written in this order so each piece
compiles against what came before:

1. **Migration** (1 file, ~60 lines) — `grievance_messages` table + index +
   RLS, status enum swap, new columns, in-place data migration of
   `resolved` → `closed` (see §2.2 for the safe ordering).
2. **Service layer** — `lib/grievance.ts`:
   - `GrievanceStatus` type loses `'resolved'`, gains `'awaiting_user_response'`
   - `Grievance` interface adds 5 new columns + optional `messages?: GrievanceMessage[]`
   - New `GrievanceMessage` interface
   - `getGrievanceById` / `getGrievancesByEmail` accept `withMessages?: true`
   - `updateGrievance` shrinks to `priority` + force-close only (status writes removed)
   - **New functions**: `postAdminMessage`, `postUserDispute`,
     `acceptResolution`, `forceClose`
   - `getGrievanceStats` bucket update (replaces "resolved" with "awaitingUser")
3. **Emails** (`lib/email.ts`):
   - **Replace** `sendGrievanceResolved` → `sendGrievanceClosureProposed`
     (adds Accept / Follow-up CTA links)
   - **Add 6 new**: `sendGrievanceAdminReply`,
     `sendGrievanceDisputeReceived`, `sendGrievanceAccepted`,
     `sendGrievanceSilenceReminder`, `sendGrievanceAutoClosed`,
     `sendGrievanceForceClosed`
   - **Keep** `sendGrievanceReceived`, `sendGrievanceStatusUpdate` (still
     used for in_progress transitions)
4. **API routes**:
   - **Modify** `app/api/admin/grievances/[id]/route.ts` — PATCH drops
     `status` + `resolutionNotes`; adds `forceClose: boolean` + `forceCloseReason`
   - **New** `app/api/admin/grievances/[id]/message/route.ts` (POST)
   - **New** `app/api/guest/grievance/[id]/accept/route.ts` (POST)
   - **New** `app/api/guest/grievance/[id]/dispute/route.ts` (POST)
5. **Cron + anonymisation** (`lib/auto-cleanup.ts` + cron route):
   - **New** `remindGrievanceSilence()` — day-14 reminder
   - **New** `autoCloseSilentGrievances()` — day-30 auto-close
   - **Modify** `anonymiseStaleGrievances` predicate
     (`status='closed' AND closed_at < cutoff AND anonymised_at IS NULL`)
     and add a second pass that nulls `grievance_messages.body` for the
     anonymised parent rows
   - Wire both new functions into the existing daily cron
6. **Admin UI** (`components/GrievancesTab.tsx`):
   - Thread inline in detail modal (with dual-rendering fallback per §6.3)
   - Reply textarea + "Propose to close" checkbox
   - Force-close button + reason modal
   - Status filter swap (`'resolved'` → `'awaiting_user_response'`)
   - Stats card swap ("Resolved" → "Awaiting User")
   - Remove direct status `<select>` from edit form
7. **Guest UI** (`app/grievance/page.tsx`):
   - Thread display with dual-rendering fallback
   - Accept/Follow-up CTAs when status is `awaiting_user_response`
   - Status badge update
8. **Tests** — state-transition matrix; auto-close cron + silence reminder
   tests; updated `anonymiseStaleGrievances` predicate + thread scrub;
   rate-limiting on user actions; backward-compat assertion that legacy
   grievances render via the fallback path.

---

## 9. Risks and edge cases

| Risk | Mitigation |
|---|---|
| User loses access to their email mid-dispute | Existing OTP flow re-verifies on every `/grievance` visit; threads stay accessible from any verified session. |
| Admin force-close becomes a back door | Force-close requires a `force_close_reason` ≥20 chars; emailed to user; audit-logged. Could add a configurable per-admin rate limit. |
| Auto-close fires during an admin reply | Day-30 cron runs once daily; race window is ≤24h. If admin replies after cron starts, the row transitions before the cron commits. Acceptable. |
| Anonymisation runs before user sees the day-14 reminder | 90-day post-closure window starts at `closed_at`, well after the day-30 auto-close fires. No race. |
| Existing 'resolved' rows getting migrated to 'closed' might miss anonymisation if `closed_at` is set to NULL | Migration sets `closed_at = resolved_at` for all migrated rows so they enter the anonymisation cron's window correctly. |
| Loss of historical operational notes from `admin_notes` / `resolution_notes` on existing rows | Staging-only — no production data to preserve. Migration drops the columns outright. If any staging-era notes need to survive for testing, restore them as synthetic admin messages manually before pushing. |

---

## 10. Interaction with already-shipped 2.A.4

The grievance anonymisation cron from `pii-retention-compliance-plan.md`
§2.A.4 is currently using the old predicate (`status IN ('resolved',
'closed')` keyed off `resolved_at`). The migration in §2.2:

- Re-stamps existing `resolved` rows to `closed` and populates `closed_at`
  from `resolved_at`.
- Populates `closed_at` for existing `closed` rows too (same source).

So when the new `anonymiseStaleGrievances` ships with the predicate
`status='closed' AND closed_at < cutoff AND anonymised_at IS NULL`, it
continues to catch every row the old predicate caught, plus the new state
machine's auto-closed rows. No data loss, no orphaned rows outside the
cleanup window.

The corresponding unit tests in `tests/auto-cleanup.test.ts` (added in
2.A.4) will need their fixture data updated:

- `data: [{id: "g-1"}]` style records should include `status: "closed"`,
  `closed_at: <past>`, `anonymised_at: null` so the new predicate's
  filter assertions still pass.
- The `.in("status", ["resolved", "closed"])` assertion becomes
  `.eq("status", "closed")`.

Sequencing: this plan **supersedes** the grievance portion of the
retention plan. The retention plan's other items (correction_requests,
guest_sessions, review_tokens, Razorpay scrub) are unaffected.

---

## 11. Out of scope

- File attachments in messages (could be added in a follow-up if regulators
  want documentary evidence).
- Real-time notifications (no push, just email).
- Admin-to-admin internal notes — distinct from user-visible thread. Could
  stay in `admin_notes` column if needed.
- Per-admin rate limits / fairness (force-close abuse prevention beyond the
  reason-text gate).
