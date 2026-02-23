-- Add return_courier_name to store the courier assigned for return pickup
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_courier_name TEXT;
