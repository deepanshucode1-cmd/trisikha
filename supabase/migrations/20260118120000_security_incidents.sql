-- Security Incidents Table for Incident Response System
-- Tracks security events, anomalies, and breaches for admin review

CREATE TABLE security_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_type text NOT NULL CHECK (incident_type IN (
    'rate_limit_exceeded',
    'payment_signature_invalid',
    'webhook_signature_invalid',
    'otp_brute_force',
    'unauthorized_access',
    'suspicious_pattern',
    'admin_auth_failure'
  )),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  source_ip inet,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_email text,
  endpoint text,
  description text NOT NULL,
  details jsonb DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')) DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text
);

-- Indexes for dashboard queries
CREATE INDEX idx_incidents_status_created ON security_incidents(status, created_at DESC);
CREATE INDEX idx_incidents_source_ip ON security_incidents(source_ip);
CREATE INDEX idx_incidents_severity ON security_incidents(severity);
CREATE INDEX idx_incidents_type ON security_incidents(incident_type);

-- RLS: Only admins can access incidents
ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;

-- Admins can view all incidents
CREATE POLICY "Admins can view incidents" ON security_incidents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_role WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role can insert incidents (for automated detection)
CREATE POLICY "Service can insert incidents" ON security_incidents
  FOR INSERT WITH CHECK (true);

-- Admins can update incidents (change status, add notes)
CREATE POLICY "Admins can update incidents" ON security_incidents
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_role WHERE id = auth.uid() AND role = 'admin')
  );

-- Add lockout columns to user_role table (for admin account protection)
ALTER TABLE user_role
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS locked_reason text;

COMMENT ON TABLE security_incidents IS 'Tracks security events for incident response and audit trail';
COMMENT ON COLUMN security_incidents.source_ip IS 'IP address of the request - primary tracking for guest incidents';
COMMENT ON COLUMN security_incidents.order_id IS 'Associated order for order-specific incidents';
COMMENT ON COLUMN security_incidents.admin_user_id IS 'Admin user ID for admin-related incidents';
COMMENT ON COLUMN security_incidents.guest_email IS 'Guest email for breach notifications';
COMMENT ON COLUMN user_role.locked_until IS 'Admin account locked until this timestamp';
COMMENT ON COLUMN user_role.locked_reason IS 'Reason for admin account lockout';
