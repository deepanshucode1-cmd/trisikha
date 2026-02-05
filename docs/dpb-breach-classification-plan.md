# DPB Breach Classification & Notification Tracking for Security Incidents

**Created:** 2026-02-04
**Status:** Planned

## Problem
Only vendor breaches have DPB (Data Protection Board) tracking. General security incidents (e.g., `bulk_data_export`, `unauthorized_data_access`) have no way to classify whether they're personal data breaches or track DPB notification status. Under DPDP Act, ALL personal data breaches require zero-threshold reporting.

## Approach
Add a manual per-incident breach classification step. All incidents require human investigation — the incident type alone is insufficient to determine whether personal data was actually breached. Once classified as a breach, expose a DPB notification workflow (breach type, report generation, mark notified) — mirroring the existing vendor breach pattern.

---

##Incident types

"rate_limit_exceeded"
  | "payment_signature_invalid"
  | "webhook_signature_invalid"
  | "otp_brute_force"
  | "unauthorized_access"
  | "suspicious_pattern"
  | "admin_auth_failure"
  // CIA Triad - Confidentiality
  | "bulk_data_export"           // Large SELECT queries
  | "unauthorized_data_access"   // Accessing other users' data
  // CIA Triad - Integrity
  | "data_modification_anomaly"  // Unusual UPDATE/DELETE patterns
  | "schema_change_detected"     // DDL outside deployment
  // CIA Triad - Availability
  | "service_disruption"         // DDoS or unavailability
  | "data_deletion_alert"        // Large DELETE operations
  | "backup_failure";            // Backup system issues


## Changes

### 1. Database Migration
**New file:** `supabase/migrations/20260205120000_incident_dpb_classification.sql`

Add 4 columns to `security_incidents`:
- `is_personal_data_breach boolean` — null = not classified, true/false = classified
- `dpb_breach_type text` — `'confidentiality'` / `'integrity'` / `'availability'`
- `dpb_notified_at timestamptz` — when DPB was notified (mirrors vendor breach pattern)
- `dpb_report_generated_at timestamptz` — when the formal report email was sent

### 2. Service Layer
**Modify:** `lib/incident.ts`

- Extend `Incident` interface with the 4 new fields
- Add `DpbBreachType` type export
- No auto-suggestion map — all incidents uniformly require manual investigation before classification, since the incident type alone cannot determine whether personal data was breached
- Extend `updateIncident()` to accept the new fields
- Add `generateDpbReport()` — calls existing `sendDPBBreachNotification()` from `lib/email.ts` and stamps `dpb_report_generated_at`

### 3. API Layer
**Modify:** `app/api/admin/incidents/[id]/route.ts`

Extend PATCH endpoint to accept:
- `isPersonalDataBreach: boolean` — classify the incident
- `dpbBreachType: string` — breach category
- `dpbNotifiedAt: string` — ISO timestamp for marking notified
- `generateDpbReport: { ... }` — triggers report email generation via `sendDPBBreachNotification()`

### 4. UI — Incident Detail Modal
**Modify:** `components/SecurityDashboard.tsx`

Add new "DPB Breach Classification" section to the incident detail modal (between Affected Users and Update Form):

**State: Not yet classified** → Shows:
- Yellow "Investigation Required" banner — reminds the admin to review incident details before classifying
- Two buttons: "Yes, Personal Data Breach" / "Not a Data Breach"
- DPDP zero-threshold notice

**State: Classified as NOT a breach** → Shows:
- Green confirmation with "Reclassify" link

**State: Classified as breach** → Shows:
- Breach type dropdown (confidentiality/integrity/availability)
- DPB Notification Timeline (two steps with green/gray dots):
  1. Report Generated: [date] or "Pending" + "Generate Report" button
  2. DPB Notification: [date] or "Pending" + "Mark Notified" button (only after report generated)
- Report generation form (expandable): affected count, data categories, description, containment measures, risk mitigation, consequences, third-party/cross-border flags

### 5. UI — Incident Card Badge
**Modify:** `components/SecurityDashboard.tsx`

Add a small badge next to the status badge on incident cards:
- `DPB Pending` (red) — classified as breach but not notified
- `DPB Notified` (green) — classified and notified

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/20260205120000_incident_dpb_classification.sql` | **New** — ALTER TABLE add 4 columns |
| `lib/incident.ts` | Extend interface, updateIncident(), add generateDpbReport() |
| `app/api/admin/incidents/[id]/route.ts` | Extend PATCH to accept breach fields + report generation |
| `components/SecurityDashboard.tsx` | Extend Incident type, add classification UI section, add card badges |

## Verification
1. Run the migration against the database
2. Open Security Dashboard > Incidents tab
3. Click on any unclassified incident — should see yellow "Investigation Required" banner
4. Click "Yes, Personal Data Breach" — should persist, show DPB workflow
5. Select breach type, click "Generate Report" — fill form, submit — should send email and show timestamp
6. Click "Mark Notified" — should persist timestamp, card should show "DPB Notified" badge
7. Open another unclassified incident — should see the same yellow "Investigation Required" banner
8. Classify as "Not a Data Breach" — should show green confirmation with reclassify option
