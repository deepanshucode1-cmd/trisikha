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

---

## 1. State machine

```
                ┌────────── dispute ──────────┐
                ▼                             │
   open ──► in_progress ──► awaiting_user_response ──► closed
                              ▲    │                      ▲
                              │    └── user accepts ──────┤
                              │                           │
                              └── admin force-close ──────┘
                                  (with reason)
```

**Transitions:**

| From | To | Trigger |
|---|---|---|
| (insert) | `open` | User submits grievance via `/api/guest/grievance` |
| `open` | `in_progress` | Admin posts the first message OR takes ownership |
| `in_progress` | `awaiting_user_response` | Admin posts message with `is_resolution=true` |
| `awaiting_user_response` | `closed` | User accepts |
| `awaiting_user_response` | `in_progress` | User disputes (posts message) |
| `awaiting_user_response` | `closed` | Day-30 silence cron |
| any non-closed | `closed` | Admin force-close (requires `force_close_reason`) |

`closed` is the only terminal state. `resolved` is **removed** from the enum.

---

## 2. Schema changes

### 2.1 New table `grievance_messages`

```sql
CREATE TABLE grievance_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id uuid NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  author_role text NOT NULL CHECK (author_role IN ('user', 'admin')),
  author_id uuid REFERENCES auth.users(id),   -- NULL for user messages
  body text,                                  -- nullable: cron may anonymise
  is_resolution_post boolean NOT NULL DEFAULT false,
  anonymised_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_grievance_messages_grievance ON grievance_messages(grievance_id, created_at);
CREATE INDEX idx_grievance_messages_anonymise_candidates
  ON grievance_messages(created_at)
  WHERE anonymised_at IS NULL;
```

`is_resolution_post=true` is what flips the grievance to
`awaiting_user_response`. Admins post other messages without that flag for
clarification rounds.

### 2.2 `grievances` table changes

```sql
-- Status enum: drop 'resolved', add 'awaiting_user_response'.
ALTER TABLE grievances DROP CONSTRAINT grievance_status_check;
ALTER TABLE grievances ADD CONSTRAINT grievance_status_check
  CHECK (status IN ('open', 'in_progress', 'awaiting_user_response', 'closed'));

-- New columns:
ALTER TABLE grievances
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by_role text CHECK (closed_by_role IN ('user', 'admin', 'auto_silence')),
  ADD COLUMN awaiting_since timestamptz,         -- last transition INTO awaiting_user_response
  ADD COLUMN silence_reminder_sent_at timestamptz,
  ADD COLUMN force_close_reason text;

-- `resolved_at` stays but its semantic narrows: time the FIRST resolution
-- was posted by admin. Kept for backward-compat queries / stats.
-- `resolution_notes` and `admin_notes` are deprecated for new rows; existing
-- rows retain them for read-only display.
```

### 2.3 Data migration for existing rows

| Existing state | Target state | Rationale |
|---|---|---|
| `status = 'resolved'` | `status = 'closed'`, `closed_at = resolved_at`, `closed_by_role = 'admin'` | Pre-existing resolutions had no consent mechanism; treat as legacy admin-closed. |
| `status = 'closed'` | unchanged | Already terminal. |
| `status IN ('open', 'in_progress')` | unchanged | Active, will follow new flow going forward. |
| `resolution_notes` (when set) | Copy into a synthetic `grievance_messages` row with `author_role='admin'`, `is_resolution_post=true`, `author_id = resolved_by` | Preserves the admin's stated resolution in the new thread model so legacy grievances render consistently in the new UI. |
| `admin_notes` (when set) | Copy into a synthetic `grievance_messages` row with `author_role='admin'`, `is_resolution_post=false` | Same reasoning. |

---

## 3. API surface

### 3.1 Guest endpoints (new)

| Method | Path | Body | Effect |
|---|---|---|---|
| `POST` | `/api/guest/grievance/[id]/accept` | `{ sessionToken }` | If grievance is `awaiting_user_response`, set `closed`, `closed_at=now`, `closed_by_role='user'`. Email admin. |
| `POST` | `/api/guest/grievance/[id]/dispute` | `{ sessionToken, message }` | If `awaiting_user_response`, append user message, flip to `in_progress`, clear `awaiting_since`. Email admin. |

Both require the same OTP-verified session token used by the existing
`/api/guest/grievance` flow.

### 3.2 Admin endpoints (modified)

| Method | Path | Body | Effect |
|---|---|---|---|
| `POST` | `/api/admin/grievances/[id]/message` | `{ body, is_resolution }` | Append admin message. If `is_resolution=true` and current status is `in_progress`, transition to `awaiting_user_response` and set `awaiting_since=now`. If non-resolution and current status is `open`, transition to `in_progress`. |
| `PATCH` | `/api/admin/grievances/[id]` | `{ priority?, force_close?, force_close_reason? }` | Existing endpoint loses direct status writes; status changes only via the message endpoint or force-close. `force_close=true` requires `force_close_reason` (≥20 chars). |

### 3.3 Validation

- User dispute body: `z.string().min(10).max(2000)` + `sanitizeObject`
- Admin message body: `z.string().min(1).max(5000)` + `sanitizeObject`
- Per-grievance rate-limit on user actions (e.g. max 3 disputes per
  grievance per hour) to prevent thread-flooding

---

## 4. Cron additions (extending `/api/cron/process-deletions`)

### 4.1 Silence reminder (day 14)

For grievances with `status='awaiting_user_response'` and `awaiting_since <
now() - 14 days` and `silence_reminder_sent_at IS NULL`:
- Send `sendGrievanceSilenceReminder` email to the user
- Set `silence_reminder_sent_at = now()`

### 4.2 Auto-close on silence (day 30)

For grievances with `status='awaiting_user_response'` and `awaiting_since <
now() - 30 days`:
- Transition to `closed`, `closed_at=now()`, `closed_by_role='auto_silence'`
- Email user (`sendGrievanceAutoClosed`) and admin

### 4.3 Anonymisation cron (replaces 2.A.4 logic)

The previously-shipped `anonymiseStaleGrievances` predicate must be updated:

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
1. Anonymise the grievance row (existing PII columns: `email`, `subject`,
   `description`, `ip_address`, `user_agent`, `force_close_reason`)
2. Anonymise the message thread: `UPDATE grievance_messages SET body=NULL,
   anonymised_at=now() WHERE grievance_id IN (just-anonymised) AND
   anonymised_at IS NULL`

90-day clock measured from `closed_at` (was `resolved_at`).

---

## 5. Email templates (new)

| Function | Recipient | When |
|---|---|---|
| `sendGrievanceResolutionPosted` | User | Admin posts `is_resolution=true`. Body includes accept/dispute CTA links to `/grievance` (signed). |
| `sendGrievanceAdminReply` | User | Admin posts a non-resolution message (clarifying question, follow-up). |
| `sendGrievanceDisputeReceived` | Admin (configured grievance officer) | User disputes. |
| `sendGrievanceAccepted` | Admin | User accepts; grievance closed. |
| `sendGrievanceSilenceReminder` | User | Day 14 of silence post-resolution. |
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
  - "Accept resolution" button → POST `/api/guest/grievance/[id]/accept`
  - "I want to follow up" → opens a text area + Submit → POST `.../dispute`
- When status is `closed`: read-only banner with `closed_by_role` and date
- When status is `in_progress` / `open`: read-only thread, no input

### 6.2 `components/GrievancesTab.tsx` (admin)

Detail modal gains:
- Full message thread inline (admin and user posts visible)
- Reply text area + Submit button
- Checkbox: "Mark this as my resolution" (controls `is_resolution`)
- Force-close button → modal asking for `force_close_reason`
- Status filter dropdown updated to new enum values

The status `<select>` in the existing edit form is **removed** — status is
now derived from message actions, not directly settable.

---

## 7. SLA tracking

Per the user's decision, the SLA clock is a single 90-day timer from
`created_at`. No changes needed to `sla_deadline` or the existing overdue
stats logic. `awaiting_user_response` rows still count against admin SLA
even when the ball is with the user — this is intentional and defensible.

---

## 8. Implementation order

1. **Migration** — `grievance_messages` table, status enum update, new
   columns, data migration for existing rows. Single migration file.
2. **Service layer** — `lib/grievance.ts` gains:
   - `postAdminMessage({ grievanceId, adminId, body, isResolution })`
   - `postUserDispute({ grievanceId, body })`
   - `acceptResolution({ grievanceId })`
   - `forceClose({ grievanceId, adminId, reason })`
   Existing `updateGrievance` PATCH path narrows to priority + force-close.
3. **API routes** — guest accept/dispute, admin message/force-close.
4. **Cron** — silence reminder + auto-close + updated anonymisation
   predicate (drop-in replacement for existing `anonymiseStaleGrievances`).
5. **Emails** — seven new templates; remove `sendGrievanceResolved`.
6. **Admin UI** — thread + reply box + force-close modal in
   `GrievancesTab.tsx`.
7. **Guest UI** — thread + accept/dispute on `/grievance`.
8. **Tests** — state-transition matrix, auto-close cron, anonymisation
   updates, rate limiting.

---

## 9. Risks and edge cases

| Risk | Mitigation |
|---|---|
| User loses access to their email mid-dispute | Existing OTP flow re-verifies on every `/grievance` visit; threads stay accessible from any verified session. |
| Admin force-close becomes a back door | Force-close requires a `force_close_reason` ≥20 chars; emailed to user; audit-logged. Could add a configurable per-admin rate limit. |
| Auto-close fires during an admin reply | Day-30 cron runs once daily; race window is ≤24h. If admin replies after cron starts, the row transitions before the cron commits. Acceptable. |
| Anonymisation runs before user sees the day-14 reminder | 90-day post-closure window starts at `closed_at`, well after the day-30 auto-close fires. No race. |
| Existing 'resolved' rows getting migrated to 'closed' might miss anonymisation if `closed_at` is set to NULL | Migration sets `closed_at = resolved_at` for all migrated rows so they enter the anonymisation cron's window correctly. |
| Migration of `resolution_notes` / `admin_notes` to synthetic messages duplicates PII | The legacy columns will be NULLED in the same migration step after the copy succeeds, leaving the message thread as the sole source. |

---

## 10. Interaction with already-shipped 2.A.4

The grievance anonymisation cron from `pii-retention-compliance-plan.md`
§2.A.4 is currently using the old predicate (`status IN ('resolved',
'closed')`). When this workflow ships:
- Update the predicate (see §4.3 above).
- Add the message-table anonymisation pass.
- The migration in §2.3 will retro-fit existing `resolved` rows to `closed`,
  so the new cron predicate continues to catch them.

Sequencing: this plan **supersedes** the grievance portion of the retention
plan. The retention plan's other items (correction_requests, guest_sessions,
review_tokens, Razorpay scrub) are unaffected.

---

## 11. Out of scope

- File attachments in messages (could be added in a follow-up if regulators
  want documentary evidence).
- Real-time notifications (no push, just email).
- Admin-to-admin internal notes — distinct from user-visible thread. Could
  stay in `admin_notes` column if needed.
- Per-admin rate limits / fairness (force-close abuse prevention beyond the
  reason-text gate).
