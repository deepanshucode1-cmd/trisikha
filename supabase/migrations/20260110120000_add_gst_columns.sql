-- Add GST tax tracking columns to orders table
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS taxable_amount numeric(10,2),
ADD COLUMN IF NOT EXISTS cgst_amount numeric(10,2),
ADD COLUMN IF NOT EXISTS sgst_amount numeric(10,2),
ADD COLUMN IF NOT EXISTS igst_amount numeric(10,2),
ADD COLUMN IF NOT EXISTS total_gst_amount numeric(10,2),
ADD COLUMN IF NOT EXISTS gst_rate numeric(4,2) DEFAULT 5.00,
ADD COLUMN IF NOT EXISTS supply_type text CHECK (supply_type IN ('intrastate', 'interstate'));

-- Add GST tracking to order items for detailed tax breakdown
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS gst_rate numeric(4,2) DEFAULT 5.00,
ADD COLUMN IF NOT EXISTS taxable_amount numeric(10,2),
ADD COLUMN IF NOT EXISTS gst_amount numeric(10,2);

-- Create index for tax reporting queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at_gst ON public.orders (created_at, total_gst_amount);

-- Backfill existing orders with calculated tax values (5% GST rate)
-- Formula: taxable_amount = total / 1.05, gst_amount = total - taxable_amount
UPDATE public.orders
SET
  taxable_amount = ROUND(subtotal_amount / 1.05, 2),
  total_gst_amount = ROUND(subtotal_amount - (subtotal_amount / 1.05), 2),
  cgst_amount = ROUND((subtotal_amount - (subtotal_amount / 1.05)) / 2, 2),
  sgst_amount = ROUND((subtotal_amount - (subtotal_amount / 1.05)) / 2, 2),
  igst_amount = 0,
  gst_rate = 5.00,
  supply_type = 'intrastate'
WHERE taxable_amount IS NULL AND subtotal_amount IS NOT NULL;

-- Backfill existing order items
UPDATE public.order_items
SET
  taxable_amount = ROUND((unit_price * quantity) / 1.05, 2),
  gst_amount = ROUND((unit_price * quantity) - ((unit_price * quantity) / 1.05), 2),
  gst_rate = 5.00
WHERE taxable_amount IS NULL;
