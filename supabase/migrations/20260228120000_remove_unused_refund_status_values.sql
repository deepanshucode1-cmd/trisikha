-- Remove unused REFUND_REQUESTED and NOT_REQUESTED from refund_status CHECK.
-- The cancellation flow goes straight to REFUND_INITIATED (via Razorpay API),
-- and NULL represents "no refund" — so these two values are never set.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS refund_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT refund_status_check
  CHECK (refund_status IN (
    'REFUND_INITIATED',
    'REFUND_COMPLETED',
    'REFUND_FAILED'
  ));
