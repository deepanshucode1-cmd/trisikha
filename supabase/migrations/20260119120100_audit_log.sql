-- Audit Log Table for DPDP Act Compliance
-- Tracks data access and modifications for CIA triad monitoring
-- (Confidentiality, Integrity, Availability)

-- Create audit_log table
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was accessed/modified
  table_name text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),

  -- Who performed the action
  user_id uuid REFERENCES auth.users(id),
  user_role text, -- 'admin', 'user', 'service', 'anonymous'
  ip_address inet,

  -- Data changes (for UPDATE/DELETE operations)
  old_data jsonb,
  new_data jsonb,

  -- Query context
  query_type text CHECK (query_type IN ('single', 'bulk', 'export')),
  row_count integer DEFAULT 1,

  -- Additional context
  endpoint text, -- API endpoint that triggered the operation
  reason text,   -- Optional reason for the operation

  -- Timestamps
  created_at timestamptz DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX idx_audit_log_operation ON audit_log(operation);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_ip_address ON audit_log(ip_address);

-- Composite index for common queries
CREATE INDEX idx_audit_log_table_op_date ON audit_log(table_name, operation, created_at DESC);

-- Enable RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can view audit log (for security review)
CREATE POLICY "Admins can view audit log"
  ON audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Service role can insert audit log entries (for backend logging)
CREATE POLICY "Service role can insert audit log"
  ON audit_log FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role can read audit log
CREATE POLICY "Service role can read audit log"
  ON audit_log FOR SELECT
  TO service_role
  USING (true);

-- No updates or deletes allowed on audit log (immutable for compliance)
-- Admins cannot modify audit log entries to ensure integrity

-- ============================================================================
-- VENDOR BREACH LOG
-- Track third-party vendor breach notifications (Data Fiduciary responsibility)
-- ============================================================================

CREATE TABLE vendor_breach_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  vendor_name text NOT NULL, -- 'razorpay', 'shiprocket', 'supabase'
  breach_description text NOT NULL,
  affected_data_types text[] NOT NULL, -- ['email', 'phone', 'payment_info', 'address']

  -- Timeline
  breach_occurred_at timestamptz,
  vendor_notified_us_at timestamptz NOT NULL,
  we_notified_dpb_at timestamptz, -- Data Protection Board notification
  users_notified_at timestamptz,

  -- Impact assessment
  affected_user_count integer,
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

  -- Response
  containment_actions text[],
  remediation_status text CHECK (remediation_status IN ('pending', 'in_progress', 'completed')),

  -- Documentation
  vendor_reference_id text,
  internal_incident_id uuid REFERENCES security_incidents(id),
  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_vendor_breach_log_vendor ON vendor_breach_log(vendor_name);
CREATE INDEX idx_vendor_breach_log_created ON vendor_breach_log(created_at DESC);

-- Enable RLS
ALTER TABLE vendor_breach_log ENABLE ROW LEVEL SECURITY;

-- Admins can view vendor breach log
CREATE POLICY "Admins can view vendor breach log"
  ON vendor_breach_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Service role full access for backend operations
CREATE POLICY "Service role full access to vendor_breach_log"
  ON vendor_breach_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
