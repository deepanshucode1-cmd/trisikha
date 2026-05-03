-- Cart-recovery resume tokens for abandoned checkouts
-- Day-1 cron issues a token, embeds it in the recovery and day-5 emails.
-- Token is single-use and expires with the order's deletion window.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS resume_token_hash text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS resume_token_expires_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS resume_token_used_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS resume_email_sent_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_resume_token_hash
  ON orders(resume_token_hash) WHERE resume_token_hash IS NOT NULL;

-- Symmetric counterpart to decrement_stock used when rolling back an
-- abandoned checkout so a fresh checkout can re-decrement it.
CREATE OR REPLACE FUNCTION increment_stock(product_id uuid, quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products
  SET stock = stock + quantity
  WHERE id = product_id;
END;
$$;

REVOKE ALL ON FUNCTION increment_stock(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION increment_stock(uuid, integer) TO service_role;
