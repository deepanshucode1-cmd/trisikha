-- Product specifications table for FCO / technical data
-- Separate from products table since specs don't apply to all product types

CREATE TABLE IF NOT EXISTS public.product_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  npk_nitrogen_percent numeric(5,2),
  npk_phosphorus_percent numeric(5,2),
  npk_potassium_percent numeric(5,2),
  organic_matter_percent numeric(5,2),
  moisture_content_percent numeric(5,2),
  ph_value numeric(4,2),
  cn_ratio numeric(5,2),
  test_certificate_number text,
  test_certificate_date date,
  testing_laboratory text,
  manufacturing_license text,
  shelf_life_months integer,
  batch_lot_number text,
  best_before_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index on product_id (already UNIQUE, so indexed, but explicit for clarity)
CREATE INDEX IF NOT EXISTS idx_product_specifications_product_id
  ON public.product_specifications(product_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_product_specifications_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_product_specifications_timestamp
BEFORE UPDATE ON public.product_specifications
FOR EACH ROW
EXECUTE FUNCTION update_product_specifications_timestamp();

-- RLS
ALTER TABLE public.product_specifications ENABLE ROW LEVEL SECURITY;

-- Anyone can view specs (public, shown on product page)
CREATE POLICY "Anyone can view product_specifications"
  ON public.product_specifications FOR SELECT
  USING (true);

-- Only admins can insert specs
CREATE POLICY "Only admins can insert product_specifications"
  ON public.product_specifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Only admins can update specs
CREATE POLICY "Only admins can update product_specifications"
  ON public.product_specifications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );

-- Only admins can delete specs
CREATE POLICY "Only admins can delete product_specifications"
  ON public.product_specifications FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role
      WHERE user_role.id = auth.uid()
      AND user_role.role = 'admin'
    )
  );
