
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS order_status text,
ADD COLUMN IF NOT EXISTS Cancellation_status text;