-- RPC function to generate sequential credit note numbers
-- Format: CN-{FY}-{SEQ} where FY is Indian fiscal year (April-March)
-- Example: CN-2526-00001 for fiscal year 2025-26

CREATE OR REPLACE FUNCTION get_next_credit_note_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  seq_val bigint;
  fiscal_year text;
  current_year int;
  next_year int;
BEGIN
  -- Get next sequence value
  SELECT nextval('credit_note_seq') INTO seq_val;

  -- Calculate Indian fiscal year (April to March)
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::int;

  IF EXTRACT(MONTH FROM CURRENT_DATE) >= 4 THEN
    -- April onwards: FY is current year to next year
    next_year := current_year + 1;
  ELSE
    -- Jan-March: FY is previous year to current year
    next_year := current_year;
    current_year := current_year - 1;
  END IF;

  -- Format: last 2 digits of each year (e.g., 2025-26 becomes "2526")
  fiscal_year := RIGHT(current_year::text, 2) || RIGHT(next_year::text, 2);

  -- Return formatted credit note number with 5-digit padded sequence
  RETURN 'CN-' || fiscal_year || '-' || LPAD(seq_val::text, 5, '0');
END;
$$;

-- Grant execute permission to authenticated and service role
GRANT EXECUTE ON FUNCTION get_next_credit_note_number() TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_credit_note_number() TO service_role;
