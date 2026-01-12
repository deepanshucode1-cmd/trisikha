-- Returns System Migration
-- Adds columns for tracking delivery timestamps and return processing

-- Add timestamps for 48-hour return window calculation
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Add return-specific fields
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS return_reason TEXT,
ADD COLUMN IF NOT EXISTS return_pickup_scheduled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS return_pickup_awb TEXT,
ADD COLUMN IF NOT EXISTS return_refund_amount NUMERIC(10,2);

-- Add return_status column if not exists
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS return_status TEXT DEFAULT 'NOT_REQUESTED';

-- Drop existing constraints if they exist
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS return_status_check;

-- Add return_status CHECK constraint
ALTER TABLE public.orders
ADD CONSTRAINT return_status_check
CHECK (return_status IN (
  'NOT_REQUESTED',
  'RETURN_REQUESTED',
  'RETURN_PICKUP_SCHEDULED',
  'RETURN_IN_TRANSIT',
  'RETURN_DELIVERED',
  'RETURN_REFUND_INITIATED',
  'RETURN_REFUND_COMPLETED',
  'RETURN_CANCELLED',
  'RETURN_FAILED'
));

-- Update shiprocket_status constraint to allow PICKED UP status from webhook
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS shipment_status_check;

ALTER TABLE public.orders
ADD CONSTRAINT shipment_status_check
CHECK (shiprocket_status IN (
  'NOT_SHIPPED',
  'AWB_ASSIGNED',
  'PICKUP_SCHEDULED',
  'PICKED UP',
  'SHIPPED',
  'Delivered',
  'SHIPPING_CANCELLED',
  'SHIPPING_CANCELLATION_FAILED'
));

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_orders_picked_up_at ON public.orders(picked_up_at) WHERE picked_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_delivered_at ON public.orders(delivered_at) WHERE delivered_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_return_status ON public.orders(return_status) WHERE return_status != 'NOT_REQUESTED';
CREATE INDEX IF NOT EXISTS idx_orders_return_pickup_awb ON public.orders(return_pickup_awb) WHERE return_pickup_awb IS NOT NULL;
