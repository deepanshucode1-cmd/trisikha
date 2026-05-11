-- Migration: Remove 'eligible' and 'failed' from deletion_requests status
--
-- Context: deletion execution is now automated by the daily cron
-- (autoExecutePendingDeletions). The intermediate 'eligible' state is no longer
-- needed — pending requests past their 14-day window are executed directly.
-- 'failed' is also dropped: per the retry policy, failed executions leave the
-- row at 'pending' so the next cron cycle retries.

-- 1. Flip any legacy rows to 'pending' so they get picked up by the next cron
UPDATE deletion_requests
SET status = 'pending',
    updated_at = now()
WHERE status IN ('eligible', 'failed');

-- 2. Tighten the CHECK constraint
ALTER TABLE deletion_requests
DROP CONSTRAINT IF EXISTS deletion_requests_status_check;

ALTER TABLE deletion_requests
ADD CONSTRAINT deletion_requests_status_check
CHECK (status IN ('pending', 'deferred_legal', 'cancelled', 'completed'));

-- 3. Drop the now-unused index on the 'eligible' status
DROP INDEX IF EXISTS idx_deletion_requests_eligible;

-- 4. Rebuild the active-email unique index without 'eligible'
DROP INDEX IF EXISTS idx_deletion_requests_active_email;
CREATE UNIQUE INDEX idx_deletion_requests_active_email ON deletion_requests(guest_email)
  WHERE status IN ('pending', 'deferred_legal');

-- 5. Refresh the column comment
COMMENT ON COLUMN deletion_requests.status IS 'pending: awaiting cron execution (in 14-day window or queued for retry), deferred_legal: has paid orders (8-year retention), cancelled: user cancelled, completed: data deleted/anonymized';
