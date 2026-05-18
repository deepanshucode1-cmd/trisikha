-- ============================================================
-- Correction Request Retention (DPDP §4 + §8(7) — purpose-served erasure)
--
-- Once a correction request reaches a terminal state (approved/rejected),
-- its purpose is served. The audit trail (what field, what status, who
-- processed, when) is operationally valuable and stays. The PII payload
-- (email, current_value, requested_value, ip_address, user_agent) does
-- not — it gets nulled out 90 days after `processed_at` by the daily cron.
-- The 90-day grace matches the DPDP Rule 14(3) grievance appeal window.
-- ============================================================

ALTER TABLE correction_requests
  ADD COLUMN anonymised_at timestamptz;

-- Allow the PII columns to be nulled. current_value and requested_value
-- were NOT NULL before — relax so the cron can overwrite them with NULL.
ALTER TABLE correction_requests
  ALTER COLUMN current_value DROP NOT NULL,
  ALTER COLUMN requested_value DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL;

-- Partial index for the cron sweep: only rows that have been processed and
-- not yet anonymised need scanning. Keeps the predicate cheap as the table
-- grows.
CREATE INDEX idx_correction_requests_anonymise_candidates
  ON correction_requests(processed_at)
  WHERE status IN ('approved', 'rejected') AND anonymised_at IS NULL;

COMMENT ON COLUMN correction_requests.anonymised_at IS 'When the PII payload (email, values, ip, user_agent) was nulled by the auto-cleanup cron. The audit residue (status, field_name, processed_by, processed_at) is preserved.';
