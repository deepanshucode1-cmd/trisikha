-- Fix: Change TIMESTAMP to TIMESTAMPTZ for proper timezone handling
ALTER TABLE guest_data_sessions
  ALTER COLUMN otp_expires_at TYPE TIMESTAMPTZ USING otp_expires_at AT TIME ZONE 'UTC',
  ALTER COLUMN otp_locked_until TYPE TIMESTAMPTZ USING otp_locked_until AT TIME ZONE 'UTC',
  ALTER COLUMN session_expires_at TYPE TIMESTAMPTZ USING session_expires_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
