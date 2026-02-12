-- ============================================================
-- Review System Migration
-- Creates: review_tokens, reviews, review_helpful_votes tables
-- Modifies: products (avg_rating, review_count), orders (review_email_sent_at)
-- ============================================================

-- 1. review_tokens table
CREATE TABLE review_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  guest_email VARCHAR(255) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_order_item_token UNIQUE (order_item_id)
);

CREATE INDEX idx_review_tokens_token ON review_tokens(token);
CREATE INDEX idx_review_tokens_order ON review_tokens(order_id);
CREATE INDEX idx_review_tokens_unconsumed ON review_tokens(expires_at) WHERE consumed_at IS NULL;

-- 2. reviews table
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  review_token_id UUID NOT NULL REFERENCES review_tokens(id) ON DELETE RESTRICT,
  product_name VARCHAR(200) NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT DEFAULT NULL CHECK (review_text IS NULL OR (char_length(review_text) >= 10 AND char_length(review_text) <= 1000)),
  helpful_count INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT TRUE,
  removed_by_admin_at TIMESTAMPTZ DEFAULT NULL,
  removal_reason TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_order_item_review UNIQUE (order_item_id),
  CONSTRAINT unique_review_token UNIQUE (review_token_id)
);

CREATE INDEX idx_reviews_product_visible ON reviews(product_id) WHERE is_visible = TRUE;
CREATE INDEX idx_reviews_product_rating ON reviews(product_id, rating) WHERE is_visible = TRUE;
CREATE INDEX idx_reviews_created ON reviews(created_at DESC);
CREATE INDEX idx_reviews_order ON reviews(order_id);
CREATE INDEX idx_reviews_helpful ON reviews(helpful_count DESC) WHERE is_visible = TRUE;

-- 3. review_helpful_votes table (prevents duplicate upvotes)
CREATE TABLE review_helpful_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  voter_ip_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_review_vote UNIQUE (review_id, voter_ip_hash)
);

CREATE INDEX idx_review_votes_review ON review_helpful_votes(review_id);

-- 4. Add review aggregate columns to products
ALTER TABLE products
  ADD COLUMN avg_rating NUMERIC(2,1) DEFAULT NULL,
  ADD COLUMN review_count INTEGER DEFAULT 0;

-- 5. Add review_email_sent_at to orders
ALTER TABLE orders
  ADD COLUMN review_email_sent_at TIMESTAMPTZ DEFAULT NULL;

-- 6. Trigger function to update product review stats
CREATE OR REPLACE FUNCTION update_product_review_stats()
RETURNS TRIGGER AS $$
DECLARE
  target_product_id UUID;
BEGIN
  -- Determine which product_id to update
  IF TG_OP = 'DELETE' THEN
    target_product_id := OLD.product_id;
  ELSE
    target_product_id := COALESCE(NEW.product_id, OLD.product_id);
  END IF;

  -- Skip if no product_id
  IF target_product_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Recalculate stats
  UPDATE products SET
    avg_rating = (
      SELECT ROUND(AVG(rating)::numeric, 1)
      FROM reviews
      WHERE product_id = target_product_id AND is_visible = TRUE
    ),
    review_count = (
      SELECT COUNT(*)
      FROM reviews
      WHERE product_id = target_product_id AND is_visible = TRUE
    )
  WHERE id = target_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger on reviews table
CREATE TRIGGER trg_update_review_stats
AFTER INSERT OR UPDATE OF is_visible OR DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_product_review_stats();

-- 8. Enable RLS on new tables
ALTER TABLE review_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_helpful_votes ENABLE ROW LEVEL SECURITY;

-- RLS policies: service role can do everything (app uses service client)
CREATE POLICY "Service role full access on review_tokens"
  ON review_tokens FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on reviews"
  ON reviews FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on review_helpful_votes"
  ON review_helpful_votes FOR ALL
  USING (auth.role() = 'service_role');

-- Public read access for visible reviews (for SSR without service client)
CREATE POLICY "Public read visible reviews"
  ON reviews FOR SELECT
  USING (is_visible = TRUE);
