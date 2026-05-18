# PII Retention Compliance Plan (DPDP Act 2023 / DPDP Rules 2025)

**Scope:** Bring every PII-bearing table in the app into compliance with DPDP
§4 (purpose limitation), §8(7) (erasure when purpose served), Rule 3 (notice
accuracy), and Rule 8(3) (48-hour pre-erasure notice). Closes the gaps
identified in the retention audit dated 2026-05-16.

**Out of scope:** the already-shipped 8-year tax retention for paid orders
(`docs/dpdp-rules-2025-compliance-plan.md` §1.1) and the 14-day deletion
cooling-off window. Both are compliant under §17(1)(a) and Rule 8(3).

---

## 0. Legal frame

| Provision | What it forces us to do |
|---|---|
| **§4 Purpose limitation** | Stop retaining a record the moment its specified purpose is served. |
| **§5 / Rule 3 Notice** | Disclosed retention must match actual retention. |
| **§8(7) Erasure** | Erase when purpose served, unless another law requires retention. |
| **§17(1)(a) Tax/legal carve-out** | Only paid-order PII qualifies (CGST §36, IT Act). Everything else is in scope. |
| **Rule 8 Third Schedule** | The 3-year retention cap binds only "significant" e-commerce (≥2 cr users). Trisikha is not — but §8(7)'s "purpose served" test still applies to every category. |
| **Rule 8(3)** | 48-hour pre-erasure notice (already implemented for orders + deferred-legal expiry; reuse for new flows where applicable). |

---

## 1. Current state — PII inventory

| Table / field | Stores | Today | Status |
|---|---|---|---|
| `orders` (paid) PII | name, email, phone, addr | 8-yr CGST retention, anonymised on deletion request | ✅ Compliant |
| `orders` (abandoned) | same | 7-day delete with day-5 48hr notice | ✅ Compliant |
| `orders.otp_*` | OTP, 10-min TTL | Cleared on deletion | ✅ Compliant |
| Razorpay `notes` (name/email/phone) | PII passed to Razorpay | Scrubbed only in `deleteAbandonedCheckouts` (`lib/auto-cleanup.ts:277`) | ❌ Gap — not scrubbed in deletion-request execution paths |
| `deletion_requests` | guest_email, ip, user_agent | Indefinite retention after terminal state | ⚠️ Soft gap — defensible as audit trail |
| `guest_data_sessions` | guest_email, otp_code, session_expires_at | **Rows never deleted** | ❌ §4/§8(7) violation |
| `review_tokens` | guest_email + expires_at + consumed_at | **Rows never deleted** (only `guest_email` nulled on deletion request) | ❌ §4/§8(7) violation |
| `reviews.review_text` | free-form, may carry PII | Nullified only on deletion request | ⚠️ §4 risk for stale reviews |
| `correction_requests` | email + value_old + value_new | Indefinite retention after `applied`/`rejected` | ❌ §4 violation |
| `grievances` | email, grievance body | Indefinite retention after `resolved`/`closed` | ❌ §4 violation |
| `audit_log` | oldData/newData/reason can carry PII | No purge | ⚠️ §4 risk |
| `security_incidents` + `incident_affected_users` | affected emails | No purge | ⚠️ §4 risk |
| `manifest_batches` | recipient name+addr | Tied to orders but no FK cascade verified | ⚠️ Verify cascade |
| `nominees`, `nominee_claims` (doc) | name/email/phone + identity doc | Doc: 1yr after terminal state | ✅ Doc OK; metadata acceptable as audit trail |
| Privacy policy line 112 ("inactive accounts") | Disclosure | Claims a 1-yr inactivity sweep that doesn't exist (no accounts at all) | ❌ Rule 3 misdisclosure |

---

## 2. Fix plan

Items are grouped by DPDP severity. Each item names the files touched and the
expected behaviour. Implementation should follow the project rule:
**discuss multi-file changes before applying** — present diffs per item and
wait for sign-off rather than batch-shipping the whole plan.

### 2.A Hard violations (§4 / §8(7)) — must fix

#### 2.A.1 Cleanup cron for `guest_data_sessions`

**Why:** Session/OTP purpose is served the moment the session expires. Rows
contain `guest_email` and `otp_code` and currently accumulate forever.

**Files**
- `lib/auto-cleanup.ts` — add `purgeExpiredGuestSessions()`
- `app/api/cron/process-deletions/route.ts` — call it from the daily cron
- `supabase/migrations/YYYYMMDD_guest_session_purge.sql` (optional, only if a
  partial index is needed for the predicate)

**Behaviour**
- Delete rows where `session_expires_at < now()` AND `otp_expires_at < now()`.
- Audit log a single bulk-delete event with row count (no per-email logging —
  that would re-leak the PII we just erased).
- Counters surfaced into the cron response next to existing `autoCleanup`.

**Open question:** keep a short grace window (e.g. 7 days) before deleting, in
case a user is mid-flow? Or delete immediately on expiry? Recommend
**immediate** — `session_expires_at` is already the agreed end-of-purpose
marker.

#### 2.A.2 Delete `review_tokens` rows on consumption + cron for stale unused

**Why:** Token row contains `guest_email`. Once consumed, its purpose is fully
served — replay protection is preserved by the row's absence (a token lookup
that misses = invalid token). No need to keep a tombstone with PII on it.

**Schema blocker (must fix first):**
`supabase/migrations/20260212120000_review_system.sql:33` declares
`reviews.review_token_id UUID NOT NULL REFERENCES review_tokens(id) ON DELETE
RESTRICT`. With RESTRICT we cannot delete the token row while a review row
references it. Relax the FK so the link cascades to NULL — the `reviews` row
is the evidence; the link to a specific token row is provenance metadata we
don't need post-consumption.

**Files**
- `supabase/migrations/YYYYMMDD_review_token_retention.sql`
  - `ALTER TABLE reviews ALTER COLUMN review_token_id DROP NOT NULL;`
  - `ALTER TABLE reviews DROP CONSTRAINT reviews_review_token_id_fkey,
     ADD CONSTRAINT reviews_review_token_id_fkey FOREIGN KEY (review_token_id)
     REFERENCES review_tokens(id) ON DELETE SET NULL;`
  - Optionally drop `review_tokens.consumed_at` (vestigial once consumed rows
    are deleted) and `idx_review_tokens_unconsumed`.
- `app/api/reviews/submit/route.ts:108-109` — replace the
  `UPDATE consumed_at = now()` with `DELETE FROM review_tokens WHERE id = ...`.
  Ordering: insert `reviews` row first (succeeds because the FK still
  references the live token row), then delete the token. If the delete
  fails, log it — the cron sweep below is the fallback.
- `lib/auto-cleanup.ts` — add `purgeStaleReviewTokens()` for the leftover
  cases: unused tokens past `expires_at + 30 days`, plus any consumed
  tokens that survived a failed inline delete.
- `app/api/cron/process-deletions/route.ts` — wire the cron in.

**Behaviour**
- **Inline (synchronous, hot path):** on successful review submission, delete
  the token row. Replay protection unchanged — a second submit hits "token
  not found", which is the same outcome as the previous "consumed_at set"
  check.
- **Cron (daily sweep):** delete rows where `expires_at < now() - interval
  '30 days'`. The 30-day grace on unused tokens preserves support's ability
  to debug bounced magic-link mails.

**Side effects to verify**
- `lib/deletion-request.ts:682-694` (CASE 1 anonymisation) currently scrubs
  `guest_email = '[deleted]'` on `review_tokens`. After this change, only
  *unconsumed* tokens for that email remain — the UPDATE still works
  correctly, just hits fewer rows. No code change needed there.
- `app/api/reviews/submit/route.ts:45` (`if (tokenData.consumed_at) return
  already_used`) becomes unreachable for the immediate-delete path. The
  earlier SELECT will simply find no row — handle that branch as "invalid
  token" (same user-facing message).
- `idx_review_tokens_unconsumed` partial index's `WHERE consumed_at IS NULL`
  predicate matches every surviving row after this change. Drop the partial
  qualifier or drop the index entirely — `idx_review_tokens_token` already
  serves lookup.

#### 2.A.3 Anonymise `correction_requests` post-terminal

**Why:** Once a correction is `applied` or `rejected`, the request's purpose
is served. The audit trail of "what changed" belongs in `audit_log`, not in a
PII-bearing operational table.

**Files**
- `lib/correction-request.ts` — on transition to `applied`/`rejected`,
  schedule anonymisation
- `lib/auto-cleanup.ts` — new `anonymiseStaleCorrectionRequests()` running on
  cron (decouples retention from the admin click)
- `supabase/migrations/YYYYMMDD_correction_request_retention.sql` — add
  `anonymised_at timestamptz` flag column + partial index

**Behaviour**
- 90 days after terminal state (matches DPDP grievance appeal window):
  `value_old`, `value_new` → `'[anonymised]'`; `email` → hash (or null with a
  hashed lookup for support).
- The request row stays so admins can prove what was decided — but the PII
  payload is gone.

**Note:** The 90-day window is conservative. Faster (e.g. 30 days) is
defensible but harder to support-investigate.

#### 2.A.4 Anonymise `grievances` post-terminal

**Why:** Same logic as 2.A.3 — purpose served once `resolved`/`closed` +
appeal window passes.

**Files**
- `lib/grievance.ts` — emit the anonymisation flag on terminal transition
- `lib/auto-cleanup.ts` — new `anonymiseStaleGrievances()`
- `supabase/migrations/YYYYMMDD_grievance_retention.sql` — add
  `anonymised_at timestamptz` + partial index

**Behaviour**
- 90 days after `resolved_at`/`closed_at`:
  - `body` → `'[anonymised]'`
  - `email` → hashed
  - `resolution_text` preserved (operational record, no principal PII)

#### 2.A.5 Extend `scrubRazorpayNotes` to deletion-request paths

**Why:** Today we scrub Razorpay's `notes` field only when local order rows
are hard-deleted (`lib/auto-cleanup.ts:277`). When a user files a deletion
request and we anonymise locally (CASE 1) or hard-delete (CASE 2), Razorpay
still holds the original name/email/phone in `notes`. That is a §8(7) miss —
we told the user "erased" but a third party we control hasn't been.

**Files**
- `lib/deletion-request.ts:580+` (CASE 1 anonymise block) — call
  `scrubRazorpayNotes` for each paid order's `razorpay_order_id` before the
  local UPDATE
- `lib/deletion-request.ts:780+` (CASE 2 hard-delete block) — call
  `scrubRazorpayNotes` for every order being deleted, before the DELETE
- `lib/auto-cleanup.ts:402` (`executeDeferredDeletions`) — same, before
  hard-delete

**Behaviour**
- `Promise.all(orderIds.map(scrubRazorpayNotes))` before the DB mutation.
- A scrub failure should **not** block local erasure (the DPDP duty is on us,
  Razorpay retention is best-effort). Log the failure, continue.

#### 2.A.6 Privacy-policy line 112 fix (Rule 3 misdisclosure)

**Why:** `app/privacy-policy/page.tsx:112` claims *"Inactive accounts: Data
associated with accounts inactive for over 1 year may be scheduled for
deletion, with prior notice to you."* The app has no accounts at all
(`docs/dpdp-rules-2025-compliance-plan.md` §3.1 acknowledged "not
applicable"). A disclosure that overstates protections is itself a Rule 3
violation.

**Files**
- `app/privacy-policy/page.tsx:112` — delete the bullet.
- `app/privacy-policy/page.tsx:20` — bump "Last updated" date.

---

### 2.B Soft minimisation gaps — should fix

#### 2.B.1 Define audit-log retention

**Why:** `audit_log.oldData` / `newData` / `reason` routinely carry emails,
names, addresses (see `lib/correction-request.ts:399` for one example). DPDP
doesn't mandate audit-log retention; §4 says don't keep PII longer than
needed. The regulator-friendly window is **5 years** — long enough to defend
against a complaint, short enough to demonstrate minimisation.

**Files**
- `lib/auto-cleanup.ts` — `purgeStaleAuditLog()` deleting rows older than
  5 years
- `app/api/cron/process-deletions/route.ts` — wire in
- `supabase/migrations/YYYYMMDD_audit_log_partial_index.sql` — index on
  `created_at` if not already present

**Note:** Sensitive event types (breach response, deletion execution) could
be exempted from purge if a forensic record is wanted. Default: no
exemptions — the security event is also logged in `security_incidents`.

#### 2.B.2 Define `security_incidents` retention

**Why:** Rule 7 (breach reporting) doesn't fix a retention. **5 years** also
fits here — matches limitation periods for civil claims.

**Files**
- `lib/auto-cleanup.ts` — `purgeStaleIncidents()` on the same cadence as
  2.B.1
- `incident_affected_users` rows cascade via FK (verify schema)

#### 2.B.3 Anonymise stale `reviews.review_text`

**Why:** If a customer never files a deletion request but their review body
mentions personal details, that PII is retained beyond purpose. §4 wants a
backstop.

**Files**
- `lib/auto-cleanup.ts` — `anonymiseStaleReviews()` nullifying `review_text`
  where the linked order's customer has had no interaction in N years (N
  defaults to the same 8-yr CGST clock so the trail aligns with tax records)

**Behaviour**
- Idempotent: `review_text IS NOT NULL` guard.
- Star rating preserved (no PII).

#### 2.B.4 Verify `manifest_batches` cascade

**Why:** Shipping manifests embed recipient name + full address. If a paid
order is hard-deleted at the 8-year mark but the manifest row survives, we've
recreated the PII we just erased.

**Files**
- Inspect `supabase/migrations/20251116142018_manifest_generate_table.sql`
  for the FK definition.
- If `ON DELETE CASCADE` is missing, write a one-line migration adding it.

---

### 2.C Notice accuracy — should ship with 2.A/2.B

#### 2.C.1 Per-category retention table in policy + notice

**Why:** Once the items above land, the disclosed retention should enumerate
each category so the data principal can see (per Rule 3) how long each piece
lives. This also reduces grievance volume — users stop asking "how long do
you keep X?"

**Files**
- `app/privacy-policy/page.tsx` — replace Section 6's three-bullet retention
  block with a table mirroring §1 of this doc
- `components/checkout/DataCollectionNotice.tsx` — add a one-line
  retention summary in Layer 1, link to the policy table in Layer 2

**Content (target shape)**

| Category | Retention | Why |
|---|---|---|
| Paid orders | 8 years from FY end | CGST §36, IT Act |
| Abandoned checkouts | 7 days | Purpose lapses on non-payment |
| OTPs / guest sessions | Until expiry, then purged daily | Auth purpose served |
| Magic-link review tokens | Until consumed, then purged daily | Auth purpose served |
| Correction / grievance records | 90 days after closure, then anonymised | Audit trail; PII not needed |
| Audit logs | 5 years | Compliance investigation window |
| Security incident records | 5 years | Limitation period |
| Nominee identity documents | 1 year after claim closure | Anti-fraud verification |

---

## 3. Implementation order

Recommended sequencing — each phase is independently shippable and reversible:

1. **Phase 1 — disclosure correction** (2.A.6). One-line policy edit. Lands
   risk reduction immediately at near-zero engineering cost.
2. **Phase 2 — short cleanups** (2.A.1, 2.A.2). Cron-only changes, no schema.
3. **Phase 3 — Razorpay scrub coverage** (2.A.5). Single library, three call
   sites.
4. **Phase 4 — terminal-state anonymisation** (2.A.3, 2.A.4). Migration +
   cron + service-layer touches; per-item review.
5. **Phase 5 — audit-log / incident purges** (2.B.1, 2.B.2). Background
   reduction, low user impact.
6. **Phase 6 — stale review backstop + manifest cascade** (2.B.3, 2.B.4).
7. **Phase 7 — policy + notice table** (2.C.1). Ship after Phases 1-6 land
   so the disclosed retention matches reality.

---

## 4. Test plan

### 4.1 Per-feature unit tests
- `guest_data_sessions` purge: seed expired + active rows, run purge, assert
  expired gone and active untouched.
- `review_tokens` purge: seed consumed-old, consumed-recent, expired-old,
  expired-recent, unused-active. Assert correct set deleted.
- `correction_requests` anonymisation: seed `applied` row >90 days old →
  assert `value_old`/`value_new` overwritten, email hashed, row preserved.
- `grievances` anonymisation: same shape as corrections.
- `scrubRazorpayNotes` coverage: mock Razorpay client, verify it's called for
  every `razorpay_order_id` in each of the three new call sites.

### 4.2 Cron integration
- Run `POST /api/cron/process-deletions` against a seeded fixture covering
  every category. Inspect the response counters — every new step should
  surface its own field.

### 4.3 Audit trail invariants
- After every anonymisation/purge job, `logDataAccess` should record exactly
  one bulk-update or bulk-delete row with a count. **No per-email reasons** —
  the whole point is to forget the email.

### 4.4 Manual regression
- Submit + cancel a deletion request; verify the deletion-request row still
  records the cancellation reason after cron has run.
- Place + abandon a checkout; verify the day-5 notice still fires after the
  new purges land (no accidental coupling).
- Submit a review via magic link; verify the link still works for the full
  expiry window despite the new token purge.

---

## 5. Risks and trade-offs

| Risk | Mitigation |
|---|---|
| Aggressive anonymisation breaks support investigations | 90-day grace on correction/grievance; 30-day grace on review tokens. |
| Audit-log purge erases evidence we need in a regulator complaint | 5-yr window matches CrPC / limitation period; security_incidents kept in parallel. |
| Razorpay scrub fails silently | Log + counter; failure does not block local erasure (DPDP duty is ours, not theirs). |
| Policy table goes stale as code changes | Add `app/privacy-policy/page.tsx` to the review checklist when any cron in `lib/auto-cleanup.ts` changes. |

---

## 6. Out of scope (intentionally)

- **Account-based inactivity sweeps** — Trisikha is guest-only; nothing to
  do (`docs/dpdp-rules-2025-compliance-plan.md` §3.1).
- **Marketing consent records** — deferred until marketing emails ship
  (`docs/enhanced-consent-management-plan.md`).
- **Existing 8-year tax retention** — already compliant under §17(1)(a).
- **Webhook payload retention (Razorpay / Shiprocket)** — webhooks are
  signature-verified and consumed immediately; payloads aren't stored.
