-- ============================================================
-- Grievance Retention (DPDP §4 + §8(7) — purpose-served erasure)
--
-- Once a grievance reaches a terminal state (resolved/closed), its purpose
-- is served. The audit trail (category, status, priority, resolution_notes,
-- sla_deadline, resolved_at, resolved_by) stays. The PII payload (email,
-- subject, description, ip_address, user_agent) does not — it gets nulled
-- 90 days after `resolved_at` by the daily cron. The 90-day grace matches
-- the DPDP Rule 14(3) appeal window.
-- ============================================================

ALTER TABLE grievances
  ADD COLUMN anonymised_at timestamptz;

-- Relax NOT NULL on the PII columns so the cron can overwrite them with NULL.
ALTER TABLE grievances
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN subject DROP NOT NULL,
  ALTER COLUMN description DROP NOT NULL;

-- Partial index for the cron sweep: only terminal-state rows not yet
-- anonymised need scanning.
CREATE INDEX idx_grievances_anonymise_candidates
  ON grievances(resolved_at)
  WHERE status IN ('resolved', 'closed') AND anonymised_at IS NULL;

COMMENT ON COLUMN grievances.anonymised_at IS 'When the PII payload (email, subject, description, ip, user_agent) was nulled by the auto-cleanup cron. Audit residue (category, status, priority, resolution_notes, sla_deadline, resolved_at, resolved_by) is preserved.';
