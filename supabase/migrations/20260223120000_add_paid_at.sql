-- Add paid_at timestamp to track when payment was confirmed
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Backfill: for existing paid orders, use updated_at as best approximation
UPDATE orders SET paid_at = updated_at WHERE payment_status = 'paid' AND paid_at IS NULL;
