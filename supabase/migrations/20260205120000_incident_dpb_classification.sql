-- DPB Breach Classification for Security Incidents
-- DPDP Act 2023 requires zero-threshold reporting of ALL personal data breaches.
-- This adds breach classification and DPB notification tracking to every security incident.

ALTER TABLE security_incidents
  ADD COLUMN is_personal_data_breach boolean DEFAULT NULL,
  ADD COLUMN dpb_breach_type text DEFAULT NULL
    CHECK (dpb_breach_type IN ('confidentiality', 'integrity', 'availability')),
  ADD COLUMN dpb_notified_at timestamptz DEFAULT NULL,
  ADD COLUMN dpb_report_generated_at timestamptz DEFAULT NULL;

-- Index for filtering incidents by breach classification status
CREATE INDEX idx_security_incidents_dpb_classification
  ON security_incidents (is_personal_data_breach)
  WHERE is_personal_data_breach IS NOT NULL;

COMMENT ON COLUMN security_incidents.is_personal_data_breach IS 'null = not yet classified, true = personal data breach, false = not a breach. All incidents require manual investigation before classification.';
COMMENT ON COLUMN security_incidents.dpb_breach_type IS 'CIA triad category: confidentiality (unauthorized access/disclosure), integrity (unauthorized modification/deletion), availability (loss of access).';
COMMENT ON COLUMN security_incidents.dpb_notified_at IS 'Timestamp when DPB (Data Protection Board) was notified of this breach.';
COMMENT ON COLUMN security_incidents.dpb_report_generated_at IS 'Timestamp when the formal DPB breach report email was generated and sent.';
