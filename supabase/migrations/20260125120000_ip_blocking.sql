-- IP Blocking System for Security Incidents
-- Supports temporary blocks with exponential backoff and permanent blocks

-- IP Blocklist Table
-- Stores both temporary and permanent IP blocks
CREATE TABLE ip_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL,
  block_type text NOT NULL CHECK (block_type IN ('temporary', 'permanent')),
  reason text NOT NULL,

  -- Offense tracking (for temporary blocks)
  offense_count int DEFAULT 1,
  first_offense_at timestamptz DEFAULT now(),
  last_offense_at timestamptz DEFAULT now(),

  -- Block timing
  blocked_at timestamptz DEFAULT now(),
  blocked_until timestamptz, -- NULL for permanent blocks

  -- Linking to incidents
  incident_id uuid REFERENCES security_incidents(id) ON DELETE SET NULL,
  incident_type text,

  -- Admin actions
  blocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL = automated
  unblocked_at timestamptz,
  unblocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Status
  is_active boolean DEFAULT true,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- IP Whitelist Table
-- Trusted IPs that should never be blocked
CREATE TABLE ip_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL,
  cidr_range cidr, -- Support for IP ranges like 10.0.0.0/8
  label text NOT NULL, -- e.g., "Razorpay Webhook", "Internal VPN"
  category text NOT NULL CHECK (category IN (
    'payment_gateway',    -- Razorpay, etc.
    'webhook_provider',   -- Shiprocket, etc.
    'internal',           -- Office/VPN IPs
    'monitoring',         -- Uptime checks
    'admin'               -- Admin home IPs
  )),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT unique_whitelist_ip UNIQUE (ip_address)
);

-- IP Offense History Table
-- Tracks individual offenses for cooling period calculation
CREATE TABLE ip_offense_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL,
  incident_type text NOT NULL,
  incident_id uuid REFERENCES security_incidents(id) ON DELETE SET NULL,
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  endpoint text,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX idx_blocklist_ip_active ON ip_blocklist(ip_address) WHERE is_active = true;
CREATE INDEX idx_blocklist_blocked_until ON ip_blocklist(blocked_until) WHERE is_active = true AND block_type = 'temporary';
CREATE INDEX idx_blocklist_created_at ON ip_blocklist(created_at DESC);
CREATE INDEX idx_whitelist_ip_active ON ip_whitelist(ip_address) WHERE is_active = true;
CREATE INDEX idx_whitelist_cidr ON ip_whitelist(cidr_range) WHERE is_active = true AND cidr_range IS NOT NULL;
CREATE INDEX idx_offense_history_ip ON ip_offense_history(ip_address);
CREATE INDEX idx_offense_history_created ON ip_offense_history(ip_address, created_at DESC);
-- idx_offense_history_cooling removed (cannot use mutable now() in predicate)

-- RLS Policies
ALTER TABLE ip_blocklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_offense_history ENABLE ROW LEVEL SECURITY;

-- Admins can manage ip_blocklist
CREATE POLICY "Admins can view ip_blocklist" ON ip_blocklist
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_role WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update ip_blocklist" ON ip_blocklist
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_role WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role can insert (for automated blocking)
CREATE POLICY "Service can insert ip_blocklist" ON ip_blocklist
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update ip_blocklist" ON ip_blocklist
  FOR UPDATE USING (true);

-- Admins can manage ip_whitelist
CREATE POLICY "Admins can view ip_whitelist" ON ip_whitelist
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_role WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert ip_whitelist" ON ip_whitelist
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_role WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update ip_whitelist" ON ip_whitelist
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_role WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete ip_whitelist" ON ip_whitelist
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_role WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role can read whitelist (for blocking checks)
CREATE POLICY "Service can view ip_whitelist" ON ip_whitelist
  FOR SELECT USING (true);

-- Admins can view ip_offense_history
CREATE POLICY "Admins can view ip_offense_history" ON ip_offense_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_role WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role can insert offense history
CREATE POLICY "Service can insert ip_offense_history" ON ip_offense_history
  FOR INSERT WITH CHECK (true);

-- Service role can read offense history (for cooling period calculation)
CREATE POLICY "Service can view ip_offense_history" ON ip_offense_history
  FOR SELECT USING (true);

-- Helper function to check if IP is in CIDR range or exact match
CREATE OR REPLACE FUNCTION ip_in_whitelist(check_ip inet)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM ip_whitelist
    WHERE is_active = true
    AND (
      ip_address = check_ip
      OR (cidr_range IS NOT NULL AND check_ip << cidr_range)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active block for an IP
CREATE OR REPLACE FUNCTION get_active_ip_block(check_ip inet)
RETURNS TABLE (
  id uuid,
  block_type text,
  reason text,
  offense_count int,
  blocked_until timestamptz,
  incident_type text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.block_type,
    b.reason,
    b.offense_count,
    b.blocked_until,
    b.incident_type
  FROM ip_blocklist b
  WHERE b.ip_address = check_ip
    AND b.is_active = true
    AND (b.block_type = 'permanent' OR b.blocked_until > now())
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to count offenses within cooling period (30 days)
CREATE OR REPLACE FUNCTION count_ip_offenses_in_cooling_period(check_ip inet)
RETURNS int AS $$
DECLARE
  offense_count int;
BEGIN
  SELECT COUNT(*)::int INTO offense_count
  FROM ip_offense_history
  WHERE ip_address = check_ip
    AND created_at > now() - interval '30 days';

  RETURN offense_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ip_blocking_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ip_blocklist_updated_at
  BEFORE UPDATE ON ip_blocklist
  FOR EACH ROW
  EXECUTE FUNCTION update_ip_blocking_timestamp();

CREATE TRIGGER ip_whitelist_updated_at
  BEFORE UPDATE ON ip_whitelist
  FOR EACH ROW
  EXECUTE FUNCTION update_ip_blocking_timestamp();

-- Comments for documentation
COMMENT ON TABLE ip_blocklist IS 'IP blocking for security incidents - temporary and permanent blocks with exponential backoff';
COMMENT ON TABLE ip_whitelist IS 'Trusted IPs that bypass blocking (payment gateways, webhooks, internal systems)';
COMMENT ON TABLE ip_offense_history IS 'Historical record of IP offenses for cooling period calculation (30 days)';
COMMENT ON FUNCTION ip_in_whitelist IS 'Check if an IP is whitelisted (supports exact match and CIDR ranges)';
COMMENT ON FUNCTION get_active_ip_block IS 'Get active block for an IP address if it exists';
COMMENT ON FUNCTION count_ip_offenses_in_cooling_period IS 'Count offenses in the last 30 days for exponential backoff calculation';
