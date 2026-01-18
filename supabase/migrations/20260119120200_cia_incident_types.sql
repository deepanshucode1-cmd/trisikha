-- Add CIA Triad incident types to security_incidents table
-- This enables monitoring of Confidentiality, Integrity, and Availability events
-- as required by DPDP Act compliance

-- Drop the existing check constraint
ALTER TABLE security_incidents
DROP CONSTRAINT IF EXISTS security_incidents_incident_type_check;

-- Add updated check constraint with new incident types
ALTER TABLE security_incidents
ADD CONSTRAINT security_incidents_incident_type_check
CHECK (incident_type IN (
  -- Existing types
  'rate_limit_exceeded',
  'payment_signature_invalid',
  'webhook_signature_invalid',
  'otp_brute_force',
  'unauthorized_access',
  'suspicious_pattern',
  'admin_auth_failure',
  -- CIA Triad - Confidentiality
  'bulk_data_export',           -- Large SELECT queries
  'unauthorized_data_access',   -- Accessing other users data
  -- CIA Triad - Integrity
  'data_modification_anomaly',  -- Unusual UPDATE/DELETE patterns
  'schema_change_detected',     -- DDL outside deployment
  -- CIA Triad - Availability
  'service_disruption',         -- DDoS or unavailability
  'data_deletion_alert',        -- Large DELETE operations
  'backup_failure'              -- Backup system issues
));
