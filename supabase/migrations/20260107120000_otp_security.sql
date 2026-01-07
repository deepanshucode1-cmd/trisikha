-- Add OTP attempt tracking for security
-- This prevents brute force attacks on OTP verification

-- Add OTP attempt tracking columns
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS otp_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_locked_until TIMESTAMP;

-- Add comment for documentation
COMMENT ON COLUMN orders.otp_attempts IS 'Number of failed OTP verification attempts';
COMMENT ON COLUMN orders.otp_locked_until IS 'Timestamp until which OTP verification is locked due to too many failed attempts';

-- Create index for performance on OTP expiry lookups
CREATE INDEX IF NOT EXISTS idx_orders_otp_expires ON orders(otp_expires_at) WHERE otp_expires_at IS NOT NULL;

-- Create index for locked accounts lookups
CREATE INDEX IF NOT EXISTS idx_orders_otp_locked ON orders(otp_locked_until) WHERE otp_locked_until IS NOT NULL;
