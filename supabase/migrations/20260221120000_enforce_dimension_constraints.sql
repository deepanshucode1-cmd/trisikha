-- Enforce NOT NULL and positive-value constraints on shipping dimensions
-- in products and order_items tables.
--
-- products:    source of truth — dimensions must be set before a product can be saved
-- order_items: snapshot copied from products at checkout — must mirror the same guarantee

-- ── products ──────────────────────────────────────────────────────────────────

ALTER TABLE public.products
  ALTER COLUMN weight  SET NOT NULL,
  ALTER COLUMN length  SET NOT NULL,
  ALTER COLUMN breadth SET NOT NULL,
  ALTER COLUMN height  SET NOT NULL;

ALTER TABLE public.products
  ADD CONSTRAINT products_weight_positive  CHECK (weight  > 0),
  ADD CONSTRAINT products_length_positive  CHECK (length  > 0),
  ADD CONSTRAINT products_breadth_positive CHECK (breadth > 0),
  ADD CONSTRAINT products_height_positive  CHECK (height  > 0);

-- ── order_items ───────────────────────────────────────────────────────────────

ALTER TABLE public.order_items
  ALTER COLUMN weight  SET NOT NULL,
  ALTER COLUMN length  SET NOT NULL,
  ALTER COLUMN breadth SET NOT NULL,
  ALTER COLUMN height  SET NOT NULL;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_weight_positive  CHECK (weight  > 0),
  ADD CONSTRAINT order_items_length_positive  CHECK (length  > 0),
  ADD CONSTRAINT order_items_breadth_positive CHECK (breadth > 0),
  ADD CONSTRAINT order_items_height_positive  CHECK (height  > 0);
