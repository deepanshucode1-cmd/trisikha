-- Return inspection columns for admin refund processing
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS return_admin_note TEXT,
  ADD COLUMN IF NOT EXISTS return_deduction_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_deduction_reason TEXT,
  ADD COLUMN IF NOT EXISTS return_inspection_photos TEXT[];
