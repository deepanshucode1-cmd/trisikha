-- Enable UUID generation (if not already)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User Info
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    guest_email text NOT NULL,
    guest_phone text,

    -- Payment
    total_amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'INR' NOT NULL,
    payment_id text,
    payment_status text DEFAULT 'initiated' CHECK (payment_status IN ('initiated', 'paid', 'failed', 'refunded')),
    refund_id text,
    refund_status text CHECK (refund_status IN ('initiated', 'processing', 'completed', 'failed')),

    -- Shipping / Logistics
    shipping_status text DEFAULT 'pending' CHECK (shipping_status IN ('pending', 'booked', 'shipped', 'delivered', 'cancelled')),
    shiprocket_order_id text,
    tracking_url text,

    -- Shipping Address
    shipping_name text NOT NULL,
    shipping_address_line1 text NOT NULL,
    shipping_address_line2 text,
    shipping_city text NOT NULL,
    shipping_state text NOT NULL,
    shipping_pincode text NOT NULL,
    shipping_country text NOT NULL,

    -- Billing Address
    billing_name text NOT NULL,
    billing_address_line1 text NOT NULL,
    billing_address_line2 text,
    billing_city text NOT NULL,
    billing_state text NOT NULL,
    billing_pincode text NOT NULL,
    billing_country text NOT NULL,

    -- OTP & Cancellation
    otp_code text,
    otp_expires_at timestamptz,
    reason_for_cancellation text,

    -- Timestamps
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Trigger to auto-update `updated_at`
CREATE OR REPLACE FUNCTION update_orders_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION update_orders_timestamp();
