
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS weight numeric(10,3),  -- in kg
ADD COLUMN IF NOT EXISTS length numeric(10,2),  -- in cm
ADD COLUMN IF NOT EXISTS breadth numeric(10,2),
ADD COLUMN IF NOT EXISTS height numeric(10,2);