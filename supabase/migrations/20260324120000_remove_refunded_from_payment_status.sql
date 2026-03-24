-- Remove 'refunded' from payment_status: refund lifecycle is fully tracked by refund_status.
-- Existing rows with payment_status='refunded' are set back to 'paid' (the payment did happen).

UPDATE public.orders
SET payment_status = 'paid'
WHERE payment_status = 'refunded';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('initiated', 'paid', 'failed'));
