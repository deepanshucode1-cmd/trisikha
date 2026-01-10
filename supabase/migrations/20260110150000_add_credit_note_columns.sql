-- Add credit note tracking columns to orders table
-- Used to prevent duplicate credit note emails and track when they were sent

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS credit_note_number text,
ADD COLUMN IF NOT EXISTS credit_note_sent_at timestamptz;
