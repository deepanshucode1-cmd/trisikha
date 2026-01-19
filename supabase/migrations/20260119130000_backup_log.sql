-- Backup Log Table
-- Tracks database backup history for compliance and recovery

CREATE TABLE IF NOT EXISTS backup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Backup identification
  backup_file text NOT NULL UNIQUE,
  file_size bigint,
  checksum text, -- SHA256 hash

  -- Storage info
  storage_location text DEFAULT 's3',
  s3_bucket text,
  s3_key text,

  -- Status tracking
  status text DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'restored', 'deleted')),

  -- Restore tracking
  restored_at timestamptz,
  restored_by uuid REFERENCES auth.users(id),

  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_backup_log_created_at ON backup_log(created_at DESC);
CREATE INDEX idx_backup_log_status ON backup_log(status);

-- Enable RLS
ALTER TABLE backup_log ENABLE ROW LEVEL SECURITY;

-- Admins can view backup log
CREATE POLICY "Admins can view backup_log"
  ON backup_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Service role can insert/update (for automated backups)
CREATE POLICY "Service role can manage backup_log"
  ON backup_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to check for orphaned order items (for integrity checks)
CREATE OR REPLACE FUNCTION check_orphaned_order_items()
RETURNS TABLE(order_item_id uuid, order_id uuid) AS $$
BEGIN
  RETURN QUERY
  SELECT oi.id, oi.order_id
  FROM order_items oi
  LEFT JOIN orders o ON oi.order_id = o.id
  WHERE o.id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get database health stats
CREATE OR REPLACE FUNCTION get_database_health()
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'products_count', (SELECT COUNT(*) FROM products),
    'orders_count', (SELECT COUNT(*) FROM orders),
    'order_items_count', (SELECT COUNT(*) FROM order_items),
    'users_count', (SELECT COUNT(*) FROM user_role),
    'orphaned_items', (SELECT COUNT(*) FROM check_orphaned_order_items()),
    'last_order_at', (SELECT MAX(created_at) FROM orders),
    'checked_at', NOW()
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
