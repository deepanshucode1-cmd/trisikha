-- Auto-cleanup: Track 48-hour pre-erasure notifications
-- DPDP Act requires data erasure when purpose is fulfilled and retention is no longer required

-- 1. Abandoned checkouts: track whether 48hr warning email was sent
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cleanup_notice_sent boolean DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cleanup_notice_sent_at timestamptz;

-- 2. Deferred legal expiry: track whether 48hr warning email was sent before final deletion
ALTER TABLE deletion_requests ADD COLUMN IF NOT EXISTS deferred_erasure_notified boolean DEFAULT false;
ALTER TABLE deletion_requests ADD COLUMN IF NOT EXISTS deferred_erasure_notified_at timestamptz;

-- Partial index for finding abandoned checkouts efficiently
CREATE INDEX IF NOT EXISTS idx_orders_abandoned ON orders(created_at)
  WHERE order_status = 'CHECKED_OUT' AND payment_status != 'paid';

-- Partial index for finding expired deferred deletions
CREATE INDEX IF NOT EXISTS idx_deletion_deferred_expiry ON deletion_requests(retention_end_date)
  WHERE status = 'deferred_legal' AND retention_end_date IS NOT NULL;
