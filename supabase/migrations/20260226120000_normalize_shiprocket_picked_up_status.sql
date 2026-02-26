-- Normalize shiprocket_status 'PICKED UP' (raw Shiprocket webhook value with space)
-- to 'PICKED_UP' (underscore) for consistency with order_status and the rest of
-- the codebase.
-- ORDER: drop old constraint first, then backfill, then add new constraint —
-- otherwise the UPDATE violates the existing constraint before it can be replaced.

-- 1. Drop the old constraint first (still allows 'PICKED UP' with space)
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS shipment_status_check;

-- 2. Backfill existing rows (safe now — no constraint active)
UPDATE public.orders
SET shiprocket_status = 'PICKED_UP'
WHERE shiprocket_status = 'PICKED UP';

-- 3. Add new constraint with the corrected value
ALTER TABLE public.orders
ADD CONSTRAINT shipment_status_check
CHECK (shiprocket_status IN (
  'NOT_SHIPPED',
  'AWB_ASSIGNED',
  'PICKUP_SCHEDULED',
  'PICKED_UP',
  'SHIPPED',
  'Delivered',
  'SHIPPING_CANCELLED',
  'SHIPPING_CANCELLATION_FAILED'
));
