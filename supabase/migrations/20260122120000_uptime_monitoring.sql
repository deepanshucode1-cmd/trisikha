-- Uptime Monitoring Table for DPDP Availability Compliance
-- Tracks health check results for SLA tracking and compliance reporting

CREATE TABLE IF NOT EXISTS uptime_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Health status
  status text NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),

  -- Performance metrics
  response_time_ms integer,

  -- Source identification
  source text DEFAULT 'internal' CHECK (source IN ('internal', 'uptimerobot', 'manual')),

  -- Error details (if unhealthy)
  error_message text,

  -- Timestamp
  checked_at timestamptz DEFAULT now()
);

-- Index for efficient SLA queries
CREATE INDEX idx_uptime_log_checked_at ON uptime_log(checked_at DESC);
CREATE INDEX idx_uptime_log_status ON uptime_log(status);

-- Enable RLS
ALTER TABLE uptime_log ENABLE ROW LEVEL SECURITY;

-- Admins can view uptime log
CREATE POLICY "Admins can view uptime_log"
  ON uptime_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Service role can insert/update (for automated health checks)
CREATE POLICY "Service role can manage uptime_log"
  ON uptime_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to calculate uptime percentage over a period
CREATE OR REPLACE FUNCTION get_uptime_percentage(days_back integer DEFAULT 30)
RETURNS numeric AS $$
  SELECT COALESCE(
    ROUND(
      (COUNT(*) FILTER (WHERE status = 'healthy')::numeric /
       NULLIF(COUNT(*), 0)) * 100,
      2
    ),
    100.00
  )
  FROM uptime_log
  WHERE checked_at > NOW() - (days_back || ' days')::interval;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to get uptime statistics for reporting
CREATE OR REPLACE FUNCTION get_uptime_stats(days_back integer DEFAULT 30)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'uptime_percentage', get_uptime_percentage(days_back),
    'total_checks', COUNT(*),
    'healthy_checks', COUNT(*) FILTER (WHERE status = 'healthy'),
    'degraded_checks', COUNT(*) FILTER (WHERE status = 'degraded'),
    'unhealthy_checks', COUNT(*) FILTER (WHERE status = 'unhealthy'),
    'avg_response_ms', ROUND(AVG(response_time_ms)),
    'max_response_ms', MAX(response_time_ms),
    'period_start', NOW() - (days_back || ' days')::interval,
    'period_end', NOW()
  ) INTO result
  FROM uptime_log
  WHERE checked_at > NOW() - (days_back || ' days')::interval;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find open service_disruption incident for auto-resolution
CREATE OR REPLACE FUNCTION get_open_disruption_incident()
RETURNS uuid AS $$
  SELECT id
  FROM security_incidents
  WHERE incident_type = 'service_disruption'
    AND status = 'open'
  ORDER BY created_at DESC
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Cleanup old entries (keep 90 days)
-- Run this periodically via cron/scheduled function
CREATE OR REPLACE FUNCTION cleanup_uptime_log()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM uptime_log
  WHERE checked_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE uptime_log IS 'Health check history for DPDP availability compliance and SLA tracking';
COMMENT ON FUNCTION get_uptime_percentage IS 'Calculate uptime percentage for compliance reports';
COMMENT ON FUNCTION get_uptime_stats IS 'Get detailed uptime statistics for reporting';
