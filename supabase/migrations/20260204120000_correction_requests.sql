-- Correction Requests table for DPDP Act Right to Correction (Rule 14)
-- Allows verified guests to request corrections to their personal data
-- Admin approval workflow with full audit trail

CREATE TABLE correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Requester info
  email text NOT NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,

  -- What to correct
  field_name text NOT NULL,
  current_value text NOT NULL,
  requested_value text NOT NULL,

  -- Status workflow: pending → approved/rejected
  status text NOT NULL DEFAULT 'pending',

  -- Processing info
  admin_notes text,
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id),

  -- Request metadata
  ip_address inet,
  user_agent text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT correction_field_name_check CHECK (
    field_name IN ('name', 'email', 'phone', 'address')
  ),
  CONSTRAINT correction_status_check CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT correction_values_differ CHECK (
    current_value IS DISTINCT FROM requested_value
  )
);

-- Indexes
CREATE INDEX idx_correction_requests_email ON correction_requests(email);
CREATE INDEX idx_correction_requests_status ON correction_requests(status);
CREATE INDEX idx_correction_requests_created_at ON correction_requests(created_at DESC);
CREATE INDEX idx_correction_requests_order_id ON correction_requests(order_id);

-- Enable RLS
ALTER TABLE correction_requests ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on correction_requests"
  ON correction_requests
  FOR ALL
  USING (auth.role() = 'service_role');

-- Admin read access
CREATE POLICY "Admin read access on correction_requests"
  ON correction_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Admin update access (for processing requests)
CREATE POLICY "Admin update access on correction_requests"
  ON correction_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Documentation
COMMENT ON TABLE correction_requests IS 'DPDP Rule 14 - Right to Correction requests from data principals';
COMMENT ON COLUMN correction_requests.field_name IS 'The field to correct: name, email, phone, or address';
COMMENT ON COLUMN correction_requests.status IS 'Workflow status: pending → approved/rejected';
COMMENT ON COLUMN correction_requests.processed_by IS 'Admin user who processed the request';
