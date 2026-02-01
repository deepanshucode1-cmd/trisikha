-- Migration: Create deletion_requests table for DPDP-compliant window period
-- This table tracks pending deletion requests with a 14-day cooling-off period

CREATE TABLE deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Guest identification (all customers are guests)
  guest_email text NOT NULL,

  -- Request status
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'cancelled', 'completed', 'failed')),

  -- Window period tracking
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_deletion_at timestamptz NOT NULL,  -- requested_at + 14 days
  cancelled_at timestamptz,
  completed_at timestamptz,

  -- Cancellation tracking
  cancellation_reason text,

  -- Notification tracking
  confirmation_email_sent boolean DEFAULT false,
  reminder_day1_sent boolean DEFAULT false,
  reminder_day7_sent boolean DEFAULT false,
  reminder_day13_sent boolean DEFAULT false,
  completion_email_sent boolean DEFAULT false,

  -- Audit trail
  ip_address inet,
  user_agent text,

  -- Metadata
  orders_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX idx_deletion_requests_status ON deletion_requests(status);
CREATE INDEX idx_deletion_requests_scheduled ON deletion_requests(scheduled_deletion_at)
  WHERE status = 'pending';
CREATE INDEX idx_deletion_requests_email ON deletion_requests(guest_email);

-- Only one pending request per email at a time
CREATE UNIQUE INDEX idx_deletion_requests_pending_email ON deletion_requests(guest_email)
  WHERE status = 'pending';

-- RLS policies
ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access" ON deletion_requests
  FOR ALL USING (auth.role() = 'service_role');

-- Admin can view all deletion requests
CREATE POLICY "Admin read access" ON deletion_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Comment for documentation
COMMENT ON TABLE deletion_requests IS 'Tracks guest data deletion requests with 14-day cooling-off period for DPDP compliance';
COMMENT ON COLUMN deletion_requests.scheduled_deletion_at IS 'Date when data will be anonymized (14 days after request)';
COMMENT ON COLUMN deletion_requests.status IS 'pending: waiting for window to expire, cancelled: user cancelled, completed: data anonymized, failed: anonymization failed';
