-- Create guest_data_sessions table for DPDP Act data access OTP
-- This is separate from per-order OTP fields which are for delivery verification

CREATE TABLE IF NOT EXISTS guest_data_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_code TEXT,
  otp_expires_at TIMESTAMP,
  otp_attempts INTEGER DEFAULT 0,
  otp_locked_until TIMESTAMP,
  session_token TEXT,
  session_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create unique index on email (one session per email at a time)
CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_data_sessions_email ON guest_data_sessions(email);

-- Create index for OTP expiry lookups
CREATE INDEX IF NOT EXISTS idx_guest_data_sessions_otp_expires ON guest_data_sessions(otp_expires_at) WHERE otp_expires_at IS NOT NULL;

-- Create index for session token lookups
CREATE INDEX IF NOT EXISTS idx_guest_data_sessions_token ON guest_data_sessions(session_token) WHERE session_token IS NOT NULL;

-- Add comments
COMMENT ON TABLE guest_data_sessions IS 'Stores OTP and session data for guest data access (DPDP Act compliance)';
COMMENT ON COLUMN guest_data_sessions.email IS 'Guest email address';
COMMENT ON COLUMN guest_data_sessions.otp_code IS 'Current OTP code or session token (prefixed with session:)';
COMMENT ON COLUMN guest_data_sessions.otp_expires_at IS 'When the OTP expires';
COMMENT ON COLUMN guest_data_sessions.otp_attempts IS 'Number of failed OTP attempts';
COMMENT ON COLUMN guest_data_sessions.otp_locked_until IS 'Account locked until this timestamp';
COMMENT ON COLUMN guest_data_sessions.session_token IS 'Session token after successful OTP verification';
COMMENT ON COLUMN guest_data_sessions.session_expires_at IS 'When the session expires';

-- Enable RLS
ALTER TABLE guest_data_sessions ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (no public access)
CREATE POLICY "Service role only" ON guest_data_sessions
  FOR ALL
  USING (auth.role() = 'service_role');
