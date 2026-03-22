-- Simplify return_status: remove refund-related states (handled by refund_status),
-- add RETURN_COMPLETED as the terminal state for successful returns.
-- Add refund_attempted_at column for compliance tracking.

-- 1. Drop old constraint first
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS return_status_check;

-- 2. Migrate existing rows before applying new constraint
UPDATE public.orders SET return_status = 'RETURN_COMPLETED'
  WHERE return_status = 'RETURN_REFUND_COMPLETED';

UPDATE public.orders SET return_status = 'RETURN_DELIVERED'
  WHERE return_status IN ('RETURN_REFUND_INITIATED', 'RETURN_REFUND_FAILED');

-- 3. Apply new constraint (old values no longer exist)
ALTER TABLE public.orders
  ADD CONSTRAINT return_status_check
  CHECK (return_status IN (
    'NOT_REQUESTED',
    'RETURN_REQUESTED',
    'RETURN_PICKUP_SCHEDULED',
    'RETURN_IN_TRANSIT',
    'RETURN_DELIVERED',
    'RETURN_COMPLETED',
    'RETURN_CANCELLED',
    'RETURN_FAILED'
  ));

-- 4. Add compliance column
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refund_attempted_at TIMESTAMPTZ;
