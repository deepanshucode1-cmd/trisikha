-- Add return_track_url to store the Shiprocket tracking URL for return shipments
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_track_url TEXT;
