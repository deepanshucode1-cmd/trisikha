CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relations
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,

    -- Snapshot of product details at time of purchase
    product_name text NOT NULL,
    sku text,
    hsn text,
    unit_price numeric(10,2) NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    total_price numeric(10,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,

    -- Timestamps
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_order_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_on_order_items ON public.order_items;

CREATE TRIGGER set_timestamp_on_order_items
BEFORE UPDATE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION update_order_items_updated_at();
