ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_state_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_state_code text;

CREATE OR REPLACE FUNCTION public.derive_state_code(state_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF state_name IS NULL THEN RETURN NULL; END IF;
  CASE LOWER(TRIM(state_name))
    WHEN 'jammu & kashmir' THEN RETURN '01';
    WHEN 'jammu and kashmir' THEN RETURN '01';
    WHEN 'himachal pradesh' THEN RETURN '02';
    WHEN 'punjab' THEN RETURN '03';
    WHEN 'chandigarh' THEN RETURN '04';
    WHEN 'uttarakhand' THEN RETURN '05';
    WHEN 'haryana' THEN RETURN '06';
    WHEN 'delhi' THEN RETURN '07';
    WHEN 'new delhi' THEN RETURN '07';
    WHEN 'rajasthan' THEN RETURN '08';
    WHEN 'uttar pradesh' THEN RETURN '09';
    WHEN 'bihar' THEN RETURN '10';
    WHEN 'sikkim' THEN RETURN '11';
    WHEN 'arunachal pradesh' THEN RETURN '12';
    WHEN 'nagaland' THEN RETURN '13';
    WHEN 'manipur' THEN RETURN '14';
    WHEN 'mizoram' THEN RETURN '15';
    WHEN 'tripura' THEN RETURN '16';
    WHEN 'meghalaya' THEN RETURN '17';
    WHEN 'assam' THEN RETURN '18';
    WHEN 'west bengal' THEN RETURN '19';
    WHEN 'jharkhand' THEN RETURN '20';
    WHEN 'odisha' THEN RETURN '21';
    WHEN 'orissa' THEN RETURN '21';
    WHEN 'chhattisgarh' THEN RETURN '22';
    WHEN 'madhya pradesh' THEN RETURN '23';
    WHEN 'gujarat' THEN RETURN '24';
    WHEN 'dadra and nagar haveli' THEN RETURN '26';
    WHEN 'daman and diu' THEN RETURN '26';
    WHEN 'dadra & nagar haveli and daman & diu' THEN RETURN '26';
    WHEN 'maharashtra' THEN RETURN '27';
    WHEN 'karnataka' THEN RETURN '29';
    WHEN 'goa' THEN RETURN '30';
    WHEN 'lakshadweep' THEN RETURN '31';
    WHEN 'kerala' THEN RETURN '32';
    WHEN 'tamil nadu' THEN RETURN '33';
    WHEN 'puducherry' THEN RETURN '34';
    WHEN 'pondicherry' THEN RETURN '34';
    WHEN 'andaman and nicobar islands' THEN RETURN '35';
    WHEN 'andaman & nicobar islands' THEN RETURN '35';
    WHEN 'telangana' THEN RETURN '36';
    WHEN 'andhra pradesh' THEN RETURN '37';
    WHEN 'ladakh' THEN RETURN '38';
    ELSE RETURN NULL;
  END CASE;
END;
$$;

UPDATE orders
SET shipping_state_code = public.derive_state_code(shipping_state)
WHERE shipping_state_code IS NULL AND shipping_state IS NOT NULL;

UPDATE orders
SET billing_state_code = public.derive_state_code(billing_state)
WHERE billing_state_code IS NULL AND billing_state IS NOT NULL;

DROP FUNCTION public.derive_state_code(text);
