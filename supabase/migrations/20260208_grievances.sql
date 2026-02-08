-- Grievances table for DPDP Rules 2025 Rule 14(3) - Grievance Redressal
-- Trackable digital system with 90-day SLA for grievance resolution
-- Requires OTP-verified email + confirmed orders to file

CREATE TABLE grievances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Requester info
  email text NOT NULL,

  -- Grievance details
  subject text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,

  -- Status workflow: open → in_progress → resolved/closed
  status text NOT NULL DEFAULT 'open',

  -- Priority for admin triage
  priority text NOT NULL DEFAULT 'medium',

  -- Admin processing
  admin_notes text,
  resolution_notes text,

  -- SLA tracking (90-day deadline per DPDP Rule 14(3))
  sla_deadline timestamptz NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),

  -- Request metadata
  ip_address inet,
  user_agent text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT grievance_category_check CHECK (
    category IN ('data_processing', 'correction', 'deletion', 'consent', 'breach', 'other')
  ),
  CONSTRAINT grievance_status_check CHECK (
    status IN ('open', 'in_progress', 'resolved', 'closed')
  ),
  CONSTRAINT grievance_priority_check CHECK (
    priority IN ('low', 'medium', 'high')
  )
);

-- Indexes
CREATE INDEX idx_grievances_email ON grievances(email);
CREATE INDEX idx_grievances_status ON grievances(status);
CREATE INDEX idx_grievances_sla_deadline ON grievances(sla_deadline);
CREATE INDEX idx_grievances_created_at ON grievances(created_at DESC);

-- Enable RLS
ALTER TABLE grievances ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on grievances"
  ON grievances
  FOR ALL
  USING (auth.role() = 'service_role');

-- Admin read access
CREATE POLICY "Admin read access on grievances"
  ON grievances
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Admin update access
CREATE POLICY "Admin update access on grievances"
  ON grievances
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Documentation
COMMENT ON TABLE grievances IS 'DPDP Rules 2025 Rule 14(3) - Grievance redressal system with 90-day SLA';
COMMENT ON COLUMN grievances.sla_deadline IS 'created_at + 90 days per DPDP Rule 14(3)';
COMMENT ON COLUMN grievances.category IS 'Type: data_processing, correction, deletion, consent, breach, other';
COMMENT ON COLUMN grievances.status IS 'Workflow: open → in_progress → resolved/closed';
