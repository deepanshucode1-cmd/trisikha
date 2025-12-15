ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS razorpay_order_id text;