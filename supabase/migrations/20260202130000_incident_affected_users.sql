-- Migration: Create incident_affected_users table (Option D)
-- Tracks affected users per security incident for breach notification

CREATE TABLE incident_affected_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES security_incidents(id) ON DELETE CASCADE,

  -- Affected party (guest order)
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  guest_email text NOT NULL,
  guest_phone text,

  -- What data was potentially exposed
  affected_data_types text[] NOT NULL DEFAULT '{}',
  -- Examples: ['email', 'phone', 'address', 'payment_info', 'order_details']

  -- Notification tracking
  notification_status text NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'sent', 'failed', 'not_required')),
  notified_at timestamptz,
  notification_error text,
  notification_attempts integer DEFAULT 0,

  -- Audit
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- One entry per email per incident
  UNIQUE(incident_id, guest_email)
);

-- Indexes
CREATE INDEX idx_incident_affected_users_incident ON incident_affected_users(incident_id);
CREATE INDEX idx_incident_affected_users_status ON incident_affected_users(notification_status);
CREATE INDEX idx_incident_affected_users_email ON incident_affected_users(guest_email);

-- RLS policies
ALTER TABLE incident_affected_users ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access" ON incident_affected_users
  FOR ALL USING (auth.role() = 'service_role');

-- Admin can manage affected users
CREATE POLICY "Admin full access" ON incident_affected_users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Comments
COMMENT ON TABLE incident_affected_users IS 'Tracks users affected by security incidents for DPDP breach notification';
COMMENT ON COLUMN incident_affected_users.affected_data_types IS 'Array of data types potentially exposed: email, phone, address, payment_info, order_details';
COMMENT ON COLUMN incident_affected_users.notification_status IS 'pending: not yet notified, sent: notification sent, failed: notification failed, not_required: no notification needed';
