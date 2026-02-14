-- Fix: return_status was added without a DEFAULT in migration 20251110085015,
-- and the later migration 20260112134039 used ADD COLUMN IF NOT EXISTS which
-- was a no-op since the column already existed — so the DEFAULT never applied.
-- This leaves old rows with NULL return_status, causing the review email cron
-- to skip them (it filters with .eq("return_status", "NOT_REQUESTED")).
--
-- Additionally, the old inline CHECK constraint (orders_return_status_check)
-- from 20251110085015 only allows ('initiated','in_transit','delivered','cancelled','failed')
-- and was never properly dropped — 20260112134039 dropped "return_status_check"
-- but the auto-generated name was "orders_return_status_check".

-- 1. Drop the stale auto-generated constraint that blocks 'NOT_REQUESTED'
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_return_status_check;

-- 2. Set NOT NULL default for future rows
ALTER TABLE public.orders
ALTER COLUMN return_status SET DEFAULT 'NOT_REQUESTED';

-- 3. Backfill existing NULL rows
UPDATE public.orders
SET return_status = 'NOT_REQUESTED'
WHERE return_status IS NULL;

-- 4. Make the column NOT NULL to prevent future NULLs
ALTER TABLE public.orders
ALTER COLUMN return_status SET NOT NULL;
