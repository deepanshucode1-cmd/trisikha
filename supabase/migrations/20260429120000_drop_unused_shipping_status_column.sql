-- Drop unused shipping_status column from orders.
-- The column was created in 20251027133815_create_orders_table.sql with a default
-- of 'pending' but was never written to anywhere in the application. The actual
-- fulfillment state is tracked in shiprocket_status (Shiprocket pipeline) and
-- order_status (lifecycle), so shipping_status is dead data.

DROP INDEX IF EXISTS idx_orders_shipping_status;

ALTER TABLE public.orders DROP COLUMN IF EXISTS shipping_status;
