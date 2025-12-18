
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS order_status_check;


-- Order Status CHECK
ALTER TABLE public.orders
  ADD CONSTRAINT order_status_check
  CHECK (order_status IN (
    'CHECKED_OUT',
    'CONFIRMED',
    'PICKED_UP',
    'DELIVERED',
    'CANCELLATION_REQUESTED',
    'CANCELLED',
    'RETURN_REQUESTED',
    'RETURNED'
  ));
