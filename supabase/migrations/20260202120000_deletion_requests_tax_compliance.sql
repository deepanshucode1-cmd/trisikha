-- Migration: Add tax compliance fields to deletion_requests
-- Adds support for 8-year retention deferral for paid orders

-- Add new status values
ALTER TABLE deletion_requests
DROP CONSTRAINT IF EXISTS deletion_requests_status_check;

ALTER TABLE deletion_requests
ADD CONSTRAINT deletion_requests_status_check
CHECK (status IN ('pending', 'eligible', 'deferred_legal', 'cancelled', 'completed', 'failed'));

-- Add tax compliance fields
ALTER TABLE deletion_requests
ADD COLUMN IF NOT EXISTS has_paid_orders boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS paid_orders_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS unpaid_orders_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS earliest_order_fy text,  -- e.g., '2025-26'
ADD COLUMN IF NOT EXISTS retention_end_date date,  -- 8 years from FY end
ADD COLUMN IF NOT EXISTS executed_by uuid REFERENCES user_role(id),
ADD COLUMN IF NOT EXISTS otp_cleared boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS otp_cleared_at timestamptz;

-- Update index for eligible status
DROP INDEX IF EXISTS idx_deletion_requests_eligible;
CREATE INDEX idx_deletion_requests_eligible ON deletion_requests(status)
  WHERE status = 'eligible';

-- Update index for deferred_legal status
DROP INDEX IF EXISTS idx_deletion_requests_deferred;
CREATE INDEX idx_deletion_requests_deferred ON deletion_requests(retention_end_date)
  WHERE status = 'deferred_legal';

-- Update unique constraint to include eligible status
DROP INDEX IF EXISTS idx_deletion_requests_pending_email;
CREATE UNIQUE INDEX idx_deletion_requests_active_email ON deletion_requests(guest_email)
  WHERE status IN ('pending', 'eligible', 'deferred_legal');

-- Update comments
COMMENT ON COLUMN deletion_requests.status IS 'pending: in 14-day window, eligible: ready for admin execution, deferred_legal: has paid orders (8-year retention), cancelled: user cancelled, completed: data deleted/anonymized, failed: deletion failed';
COMMENT ON COLUMN deletion_requests.has_paid_orders IS 'True if customer has orders with payment_status=paid (requires 8-year retention)';
COMMENT ON COLUMN deletion_requests.retention_end_date IS 'For deferred_legal: date when 8-year retention expires and data can be deleted';
COMMENT ON COLUMN deletion_requests.earliest_order_fy IS 'Financial year of earliest paid order (e.g., 2025-26)';
COMMENT ON COLUMN deletion_requests.executed_by IS 'Admin who executed the deletion (for audit trail)';
