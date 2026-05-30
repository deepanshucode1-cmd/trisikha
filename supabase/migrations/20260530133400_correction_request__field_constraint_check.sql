ALTER TABLE correction_requests DROP CONSTRAINT correction_field_name_check;

-- Add new constraint without 'email'
ALTER TABLE correction_requests ADD CONSTRAINT correction_field_name_check CHECK (
  field_name IN ('name', 'phone', 'shipping_address', 'billing_address')
);

-- Update comment
COMMENT ON COLUMN correction_requests.field_name IS 'The field to correct: name, phone, shipping address or billing address (email is not correctable for security reasons)';
