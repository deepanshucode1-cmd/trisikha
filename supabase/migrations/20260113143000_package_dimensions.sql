-- Add package dimension columns to orders table
-- These store the actual package dimensions used when shipping
-- Used for accurate return shipping cost calculation

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS package_weight NUMERIC,
ADD COLUMN IF NOT EXISTS package_length NUMERIC,
ADD COLUMN IF NOT EXISTS package_breadth NUMERIC,
ADD COLUMN IF NOT EXISTS package_height NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN public.orders.package_weight IS 'Actual package weight in kg at time of shipping';
COMMENT ON COLUMN public.orders.package_length IS 'Actual package length in cm at time of shipping';
COMMENT ON COLUMN public.orders.package_breadth IS 'Actual package breadth in cm at time of shipping';
COMMENT ON COLUMN public.orders.package_height IS 'Actual package height in cm at time of shipping';
