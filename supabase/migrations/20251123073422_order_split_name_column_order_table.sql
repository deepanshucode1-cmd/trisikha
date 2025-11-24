ALTER TABLE orders
-- Add new columns
ADD COLUMN shipping_first_name TEXT,
ADD COLUMN shipping_last_name TEXT,
ADD COLUMN billing_first_name TEXT,
ADD COLUMN billing_last_name TEXT;


-- Remove old columns
ALTER TABLE orders
DROP COLUMN shipping_name,
DROP COLUMN billing_name;