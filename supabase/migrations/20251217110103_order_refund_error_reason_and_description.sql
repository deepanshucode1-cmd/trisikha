
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS refund_error_code text,
ADD COLUMN IF NOT EXISTS refund_error_reason text,
ADD COLUMN IF NOT EXISTS refund_error_description text;