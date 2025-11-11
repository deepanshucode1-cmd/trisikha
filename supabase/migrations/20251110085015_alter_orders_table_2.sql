
-- 1️⃣ Refund-related fields
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS refund_amount numeric(10,2),
ADD COLUMN IF NOT EXISTS refund_initiated_at timestamptz,
ADD COLUMN IF NOT EXISTS refund_completed_at timestamptz;

-- 2️⃣ Shiprocket integration fields
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS shiprocket_shipment_id text,
ADD COLUMN IF NOT EXISTS shiprocket_awb_code text,
ADD COLUMN IF NOT EXISTS shiprocket_status text CHECK (
    shiprocket_status IN (
        'NEW',
        'READY_TO_SHIP',
        'PICKUP_SCHEDULED',
        'IN_TRANSIT',
        'DELIVERED',
        'RTO_INITIATED',
        'RTO_DELIVERED',
        'CANCELLED'
    )
),
ADD COLUMN IF NOT EXISTS shiprocket_manifest_url text,
ADD COLUMN IF NOT EXISTS shiprocket_label_url text;

-- 3️⃣ Return (Reverse Pickup) tracking
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS return_order_id text,
ADD COLUMN IF NOT EXISTS return_shipment_id text,
ADD COLUMN IF NOT EXISTS return_status text CHECK (
    return_status IN (
        'initiated',
        'in_transit',
        'delivered',
        'cancelled',
        'failed'
    )
);

-- 4️⃣ Improve filtering and performance
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders (payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_status ON public.orders (shipping_status);
CREATE INDEX IF NOT EXISTS idx_orders_shiprocket_status ON public.orders (shiprocket_status);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id);

-- 5️⃣ Update updated_at automatically on row changes
