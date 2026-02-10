-- ============================================================
-- Nominee Appointment System
-- DPDP Rules 2025, Rule 14
-- ============================================================

-- Nominees table: stores appointment records
CREATE TABLE nominees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_email TEXT NOT NULL,
  nominee_name TEXT NOT NULL,
  nominee_email TEXT NOT NULL,
  relationship TEXT NOT NULL
    CHECK (relationship IN ('spouse','child','parent','sibling','legal_guardian','other')),
  nominee_email_verified BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  revoked_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active nominee per principal (can revoke and re-appoint)
CREATE UNIQUE INDEX idx_nominees_active_unique
  ON nominees (principal_email)
  WHERE status = 'active';

-- Lookup by nominee email (for claim verification)
CREATE INDEX idx_nominees_nominee_email ON nominees (nominee_email);

-- Nominee claims table: tracks claims submitted by nominees
CREATE TABLE nominee_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nominee_id UUID NOT NULL REFERENCES nominees(id),
  principal_email TEXT NOT NULL,
  nominee_email TEXT NOT NULL,
  claim_type TEXT NOT NULL CHECK (claim_type IN ('death', 'incapacity')),
  document_path TEXT NOT NULL,
  document_filename TEXT NOT NULL,
  document_content_type TEXT NOT NULL,
  action_export BOOLEAN NOT NULL DEFAULT false,
  action_deletion BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT nominee_claims_action_check CHECK (action_export OR action_deletion),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected', 'completed')),
  admin_notes TEXT,
  processed_by TEXT,
  processed_at TIMESTAMPTZ,
  document_retained_until TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nominee_claims_status ON nominee_claims (status);
CREATE INDEX idx_nominee_claims_principal ON nominee_claims (principal_email);

-- Partial index for document retention cleanup
CREATE INDEX idx_nominee_claims_doc_retention
  ON nominee_claims (document_retained_until)
  WHERE document_path != 'deleted' AND document_retained_until IS NOT NULL;

-- RLS: service role only (same pattern as other sensitive tables)
ALTER TABLE nominees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON nominees
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE nominee_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON nominee_claims
  FOR ALL USING (auth.role() = 'service_role');

-- Storage bucket for nominee claim documents (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nominee-documents',
  'nominee-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
);
