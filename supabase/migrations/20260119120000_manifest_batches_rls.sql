-- Enable Row Level Security on manifest_batches table
-- This table stores Shiprocket manifest data for shipping operations

-- Enable RLS
ALTER TABLE manifest_batches ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MANIFEST_BATCHES POLICIES
-- ============================================================================

-- Admins can view all manifest batches
CREATE POLICY "Admins can view manifest batches"
  ON manifest_batches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Admins can insert manifest batches
CREATE POLICY "Admins can insert manifest batches"
  ON manifest_batches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Admins can update manifest batches
CREATE POLICY "Admins can update manifest batches"
  ON manifest_batches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Admins can delete manifest batches
CREATE POLICY "Admins can delete manifest batches"
  ON manifest_batches FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Service role has full access (for backend operations)
CREATE POLICY "Service role full access to manifest_batches"
  ON manifest_batches FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
