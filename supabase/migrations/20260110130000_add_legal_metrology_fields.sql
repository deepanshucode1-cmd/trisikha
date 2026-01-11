-- Add Legal Metrology fields to products table
-- Required for e-commerce compliance in India

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS country_of_origin text DEFAULT 'India',
ADD COLUMN IF NOT EXISTS manufacturer_name text,
ADD COLUMN IF NOT EXISTS manufacturer_address text,
ADD COLUMN IF NOT EXISTS net_quantity text;

-- Update existing products with default manufacturer info
UPDATE public.products
SET
  manufacturer_name = 'Trishikha Organics',
  manufacturer_address = 'Plot No 27, Swagat Industrial Area Park, Vill. Dhanot, Kadi Chatral Road, Ta. Kalol, Gandhi Nagar, Gujarat - 382721',
  country_of_origin = 'India'
WHERE manufacturer_name IS NULL;
