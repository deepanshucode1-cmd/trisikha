-- Add otp_status column to track OTP lifecycle independently of cancellation_status
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS otp_status TEXT DEFAULT NULL;

ALTER TABLE public.orders
  ADD CONSTRAINT otp_status_check
  CHECK (otp_status IN ('SENT', 'VERIFIED'));

-- Backfill: migrate OTP state out of cancellation_status
UPDATE public.orders
  SET otp_status = 'SENT', cancellation_status = NULL
  WHERE cancellation_status = 'OTP_SENT';

UPDATE public.orders
  SET otp_status = 'VERIFIED', cancellation_status = NULL
  WHERE cancellation_status = 'OTP_VERIFIED';

-- Remove OTP values from cancellation_status CHECK constraint
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS cancellation_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT cancellation_status_check
  CHECK (cancellation_status IN (
    'NONE',
    'CANCELLATION_REQUESTED',
    'CANCELLATION_REJECTED',
    'CANCELLED'
  ));
