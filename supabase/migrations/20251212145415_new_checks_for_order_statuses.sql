
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_status_check,
  DROP CONSTRAINT IF EXISTS orders_cancellation_status_check,
  DROP CONSTRAINT IF EXISTS orders_shiprocket_status_check,
  DROP CONSTRAINT IF EXISTS orders_refund_status_check;


-- Order Status CHECK
ALTER TABLE public.orders
  ADD CONSTRAINT order_status_check
  CHECK (order_status IN (
    'PLACED',
    'CONFIRMED',
    'READY_TO_SHIP',
    'SHIPPED',
    'DELIVERED',
    'CANCELLATION_REQUESTED',
    'CANCELLED',
    'RETURN_REQUESTED',
    'RETURNED'
  ));

-- Cancellation Status CHECK
ALTER TABLE public.orders
  ADD CONSTRAINT cancellation_status_check
  CHECK (cancellation_status IN (
    'NONE',
    'OTP_SENT',
    'OTP_VERIFIED',
    'CANCELLATION_REQUESTED',
    'CANCELLATION_REJECTED',
    'CANCELLED'
  ));

-- Shipment Status CHECK
ALTER TABLE public.orders
  ADD CONSTRAINT shipment_status_check
  CHECK (shiprocket_status IN (
    'NOT_SHIPPED',
    'AWB_ASSIGNED',
    'PICKUP_SCHEDULED',
    'SHIPPED',
    'DELIVERED',
    'SHIPPING_CANCELLED',
    'SHIPPING_CANCELLATION_FAILED'
  ));

-- Refund Status CHECK
ALTER TABLE public.orders
  ADD CONSTRAINT refund_status_check
  CHECK (refund_status IN (
    'NOT_REQUESTED',
    'REFUND_REQUESTED',
    'REFUND_INITIATED',
    'REFUND_COMPLETED',
    'REFUND_FAILED'
  ));
