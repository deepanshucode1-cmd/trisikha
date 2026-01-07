-- Enable Row Level Security on all tables
-- This ensures data access is controlled at the database level

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PRODUCTS POLICIES
-- ============================================================================

-- Anyone can view products (public access)
CREATE POLICY "Anyone can view products"
  ON products FOR SELECT
  USING (true);

-- Only admins can insert products
CREATE POLICY "Only admins can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Only admins can update products
CREATE POLICY "Only admins can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Only admins can delete products
CREATE POLICY "Only admins can delete products"
  ON products FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- ============================================================================
-- ORDERS POLICIES
-- ============================================================================

-- Users can view their own orders
CREATE POLICY "Users can view their own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Guest orders accessed via service role only (API handles auth)
CREATE POLICY "Service role full access to orders"
  ON orders FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins have full access to orders
CREATE POLICY "Admins full access to orders"
  ON orders FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Authenticated users can create their own orders
CREATE POLICY "Users can create their own orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own orders (for cancellation, etc.)
CREATE POLICY "Users can update their own orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- ORDER ITEMS POLICIES
-- ============================================================================

-- Users can view their order items (if they own the parent order)
CREATE POLICY "Users can view their order items"
  ON order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND (
        orders.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM user_role
          WHERE user_role.id = auth.uid()
          AND user_role.role = 'admin'
        )
      )
    )
  );

-- Service role has full access to order_items (for guest checkout)
CREATE POLICY "Service role full access to order_items"
  ON order_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins can manage all order items
CREATE POLICY "Admins can manage order items"
  ON order_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- ============================================================================
-- USER ROLE POLICIES
-- ============================================================================

-- Users can view their own role
CREATE POLICY "Users can view their own role"
  ON user_role FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_role ur
      WHERE ur.id = auth.uid()
      AND ur.role = 'admin'
    )
  );

-- Only admins can modify roles
CREATE POLICY "Only admins can modify roles"
  ON user_role FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

CREATE POLICY "Only admins can update roles"
  ON user_role FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete roles"
  ON user_role FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );
