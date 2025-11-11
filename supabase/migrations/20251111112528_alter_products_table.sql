
-- Add SKU (unique product code)
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS sku text UNIQUE;

-- Add HSN (tax classification code)
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS hsn text,
ADD COLUMN IF NOT EXISTS description text;  -- in percentage

-- Add dimensions and weight for shipping
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS weight numeric(10,3),  -- in kg
ADD COLUMN IF NOT EXISTS length numeric(10,2),  -- in cm
ADD COLUMN IF NOT EXISTS breadth numeric(10,2),
ADD COLUMN IF NOT EXISTS height numeric(10,2);

-- Optional: Add an image URL (useful for product listings)
