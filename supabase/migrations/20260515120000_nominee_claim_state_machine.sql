-- ============================================================
-- Nominee claim state machine simplification + deletion linkage
-- See: docs/nominee-claim-automation-and-retention-plan.md §4
-- ============================================================

-- 1. Drop `verified` from the claim status state machine.
--    Approving a claim now executes the requested action(s) and transitions
--    straight to `completed`, so the intermediate `verified` state is dead.
ALTER TABLE nominee_claims DROP CONSTRAINT IF EXISTS nominee_claims_status_check;

UPDATE nominee_claims SET status = 'pending' WHERE status = 'verified';

ALTER TABLE nominee_claims
  ADD CONSTRAINT nominee_claims_status_check
  CHECK (status IN ('pending', 'rejected', 'completed'));

-- 2. Link nominee-originated deletion_requests back to their source claim
--    for audit trail. NULL on guest-originated rows (the common case).
ALTER TABLE deletion_requests
  ADD COLUMN IF NOT EXISTS source_nominee_claim_id uuid
  REFERENCES nominee_claims(id) ON DELETE SET NULL;
