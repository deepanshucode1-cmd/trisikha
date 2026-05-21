-- ============================================================
-- Relax correction_values_differ CHECK constraint for anonymised rows.
--
-- The original constraint (correction_values_differ in
-- 20260204120000_correction_requests.sql) enforced that current_value !=
-- requested_value at insert time, preventing meaningless correction
-- submissions.
--
-- After 20260517130000 added anonymisation, the daily cron nulls both
-- columns on terminal rows past the 90-day window — `NULL IS DISTINCT FROM
-- NULL` evaluates to FALSE in Postgres, so the constraint fires and the
-- anonymise UPDATE rolls back.
--
-- This migration replaces the constraint with one that exempts anonymised
-- rows. The original intent (no bogus inserts) is preserved for any row
-- whose anonymised_at is still NULL.
-- ============================================================

ALTER TABLE correction_requests
  DROP CONSTRAINT correction_values_differ;

ALTER TABLE correction_requests
  ADD CONSTRAINT correction_values_differ CHECK (
    anonymised_at IS NOT NULL
    OR current_value IS DISTINCT FROM requested_value
  );
