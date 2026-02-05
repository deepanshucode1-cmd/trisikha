-- Make order_id required on correction_requests.
-- Corrections must be scoped to a specific order to avoid modifying
-- historical tax-compliant records. Only CONFIRMED orders are correctable.

ALTER TABLE correction_requests ALTER COLUMN order_id SET NOT NULL;

COMMENT ON COLUMN correction_requests.order_id IS 'Required. Corrections are always scoped to a single order. Only orders with order_status = CONFIRMED are eligible for correction.';
