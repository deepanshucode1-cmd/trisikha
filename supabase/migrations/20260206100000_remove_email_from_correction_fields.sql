-- Remove email from correctable fields (security fix)
-- Email is the identity anchor used for OTP verification and should not be correctable
-- Allowing email correction would break the identity verification chain

-- Drop the old constraint
ALTER TABLE correction_requests DROP CONSTRAINT correction_field_name_check;

-- Add new constraint without 'email'
ALTER TABLE correction_requests ADD CONSTRAINT correction_field_name_check CHECK (
  field_name IN ('name', 'phone', 'address')
);

-- Update comment
COMMENT ON COLUMN correction_requests.field_name IS 'The field to correct: name, phone, or address (email is not correctable for security reasons)';
