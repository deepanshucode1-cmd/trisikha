-- ============================================================
-- Grievance Acceptance Workflow
--
-- Replaces the one-way admin-driven resolution flow with a two-party
-- conversation requiring explicit user consent (or auto-close on silence)
-- to reach a terminal state.
--
-- See docs/grievance-acceptance-workflow-plan.md for the full design and
-- state-machine transition table.
--
-- Order of operations matters: new columns are added FIRST so the backfill
-- can populate them, THEN the CHECK constraint is swapped (which requires
-- no 'resolved' rows to exist).
-- ============================================================

-- ─── Step 1: add new columns (all nullable) ────────────────────────────────

ALTER TABLE grievances
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by_role text CHECK (closed_by_role IN ('user', 'admin', 'auto_silence')),
  ADD COLUMN awaiting_since timestamptz,
  ADD COLUMN silence_reminder_sent_at timestamptz,
  ADD COLUMN force_close_reason text;

COMMENT ON COLUMN grievances.closed_at IS 'When status moved to closed. Backfilled from resolved_at for legacy rows.';
COMMENT ON COLUMN grievances.closed_by_role IS 'Who closed it: user (accepted resolution), admin (force-close), auto_silence (day-30 cron).';
COMMENT ON COLUMN grievances.awaiting_since IS 'When the most recent admin communication during awaiting_user_response was made. Drives silence cron clocks.';
COMMENT ON COLUMN grievances.silence_reminder_sent_at IS 'Day-14 reminder marker; reset to NULL on any new admin touch so the next cycle re-arms the cron.';
COMMENT ON COLUMN grievances.force_close_reason IS 'Admin-authored audit copy explaining force-close. Not anonymised by the daily cron.';

-- ─── Step 2: backfill terminal rows and re-stamp resolved → closed ─────────
-- Old service set resolved_at on BOTH 'resolved' and 'closed' transitions
-- (lib/grievance.ts:254-262), so it's the right source. Both states get
-- closed_at populated so the new anonymisation predicate
-- (status='closed' AND closed_at < cutoff) continues to catch them.

UPDATE grievances
SET closed_at = COALESCE(resolved_at, updated_at),
    closed_by_role = 'admin'
WHERE status IN ('resolved', 'closed')
  AND closed_at IS NULL;

UPDATE grievances
SET status = 'closed', updated_at = now()
WHERE status = 'resolved';

-- ─── Step 3: swap the CHECK constraint ──────────────────────────────────────
-- Safe only after Step 2 clears 'resolved'.

ALTER TABLE grievances DROP CONSTRAINT grievance_status_check;
ALTER TABLE grievances ADD CONSTRAINT grievance_status_check
  CHECK (status IN ('open', 'in_progress', 'awaiting_user_response', 'closed'));

COMMENT ON COLUMN grievances.status IS 'Workflow: open → in_progress → awaiting_user_response → closed. resolved removed in 20260517150000.';

-- ─── Step 3b: drop deprecated legacy columns ───────────────────────────────
-- resolved_at / resolved_by: tied to the deprecated 'resolved' state.
--   closed_at + closed_by_role replace them. Safe after Step 2 copied
--   resolved_at → closed_at for terminal rows.
-- resolution_notes: admin's resolution text now lives in grievance_messages
--   (an admin message with is_resolution_post = true).
-- admin_notes: deprecated. Admin's operational comments live in the thread
--   as non-resolution admin messages. No separate internal-only field.

ALTER TABLE grievances DROP COLUMN resolved_at;
ALTER TABLE grievances DROP COLUMN resolved_by;
ALTER TABLE grievances DROP COLUMN resolution_notes;
ALTER TABLE grievances DROP COLUMN admin_notes;

-- ─── Step 4: grievance_messages table ──────────────────────────────────────

CREATE TABLE grievance_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id uuid NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  author_role text NOT NULL CHECK (author_role IN ('user', 'admin')),
  author_id uuid REFERENCES auth.users(id),
  body text,
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

CREATE INDEX idx_grievance_messages_grievance
  ON grievance_messages(grievance_id, created_at);

COMMENT ON TABLE grievance_messages IS 'Append-only message thread for each grievance. user rows carry principal PII (anonymised by daily cron); admin rows are operational audit (retained).';
COMMENT ON COLUMN grievance_messages.author_role IS 'user (guest, identity established via OTP session on the API) or admin (auth.users row).';
COMMENT ON COLUMN grievance_messages.author_id IS 'auth.users.id for admin messages, NULL for guest messages — see CHECK constraint.';
COMMENT ON COLUMN grievance_messages.proposes_close IS 'true when this admin message proposes closing the grievance (drives status → awaiting_user_response, awaiting user acceptance or dispute).';
COMMENT ON COLUMN grievance_messages.anonymised_at IS 'Set by the daily cron when body is nulled. Only set on author_role=user rows (admin messages are operational audit).';

-- ─── Step 5: RLS for grievance_messages (mirrors grievances policies) ──────

ALTER TABLE grievance_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on grievance_messages"
  ON grievance_messages
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Admin read access on grievance_messages"
  ON grievance_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admin insert access on grievance_messages"
  ON grievance_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- Guest INSERT (dispute messages) and UPDATE (cron anonymisation) go
-- through the service-role API endpoints; no direct guest-side policy.
