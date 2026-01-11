-- Credit note sequence for unique numbering
CREATE SEQUENCE IF NOT EXISTS credit_note_seq START 1;

-- Add index for credit note queries
CREATE INDEX IF NOT EXISTS idx_orders_credit_note ON public.orders (credit_note_number) 
WHERE credit_note_number IS NOT NULL;
