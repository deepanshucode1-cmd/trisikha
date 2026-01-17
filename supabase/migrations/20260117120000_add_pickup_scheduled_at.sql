-- Add pickup_scheduled_at column to orders table
-- Tracks when pickup was scheduled with Shiprocket

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS pickup_scheduled_at TIMESTAMPTZ;

-- Add index for efficient querying of scheduled pickups
CREATE INDEX IF NOT EXISTS idx_orders_pickup_scheduled_at
ON public.orders(pickup_scheduled_at)
WHERE pickup_scheduled_at IS NOT NULL;

COMMENT ON COLUMN public.orders.pickup_scheduled_at IS 'Timestamp when courier pickup was scheduled';
