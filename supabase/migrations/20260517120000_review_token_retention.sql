-- ============================================================
-- Review Token Retention (DPDP §8(7) purpose-served erasure)
--
-- After a review is submitted, the token row's purpose is served. Today the
-- row lingers indefinitely with `guest_email` PII. This migration relaxes
-- the FK from `reviews.review_token_id` so the application can delete the
-- token row inline on consumption, and drops the now-vestigial
-- `consumed_at` column + the partial index that depended on it.
--
-- Replay protection: a deleted token row produces a "token not found" miss
-- on the lookup, which is the same outcome as the previous "consumed" check.
-- ============================================================

-- 1. Allow review.review_token_id to become NULL after token deletion.
ALTER TABLE reviews
  ALTER COLUMN review_token_id DROP NOT NULL;

-- 2. Replace the ON DELETE RESTRICT FK with ON DELETE SET NULL so the token
--    row can be deleted while the review row survives as the canonical
--    record of consumption. The constraint name follows postgres's default
--    auto-generated pattern.
ALTER TABLE reviews
  DROP CONSTRAINT reviews_review_token_id_fkey;

ALTER TABLE reviews
  ADD CONSTRAINT reviews_review_token_id_fkey
  FOREIGN KEY (review_token_id)
  REFERENCES review_tokens(id)
  ON DELETE SET NULL;

-- 3. Drop the partial index whose predicate (`consumed_at IS NULL`) is
--    about to lose its meaning once consumed rows are deleted outright.
--    Point lookups by `token` are served by `idx_review_tokens_token`.
DROP INDEX IF EXISTS idx_review_tokens_unconsumed;

-- 4. Drop the consumed_at column itself. Once consumed rows are deleted by
--    the application on submission (or by the daily cron sweep for stale
--    unused tokens), there's no row left to record a consumption timestamp
--    on. The reviews row's `created_at` already captures when consumption
--    happened.
ALTER TABLE review_tokens
  DROP COLUMN IF EXISTS consumed_at;

COMMENT ON COLUMN reviews.review_token_id IS 'Originating review token. NULL once the token row has been purged (DPDP §8(7) — token PII not retained beyond consumption).';
