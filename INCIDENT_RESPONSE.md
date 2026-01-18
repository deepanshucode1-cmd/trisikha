# Incident Response Plan

## Overview

This document outlines the incident response procedures for the Trishikha Organics e-commerce platform. It covers detection, containment, eradication, recovery, and notification procedures for security incidents.

**Last Updated:** 2026-01-18

---

## Table of Contents

1. [Incident Classification](#incident-classification)
2. [Response Team & Contacts](#response-team--contacts)
3. [Detection Mechanisms](#detection-mechanisms)
4. [Response Procedures](#response-procedures)
5. [Account Lockout Procedures](#account-lockout-procedures)
6. [Breach Notification Process](#breach-notification-process)
7. [Post-Incident Review](#post-incident-review)
8. [Technical Reference](#technical-reference)

---

## Incident Classification

### Severity Levels

| Severity | Response Time | Examples |
|----------|---------------|----------|
| **Critical** | Immediate (< 15 min) | Payment signature failures, webhook tampering, data breach indicators |
| **High** | Within 1 hour | Account lockouts from brute force, multiple auth failures |
| **Medium** | Within 4 hours | Rate limit threshold breaches, unauthorized API access patterns |
| **Low** | Within 24 hours | Single rate limit events, invalid input attempts |

### Incident Types

| Type | Description | Auto-Detection Threshold |
|------|-------------|-------------------------|
| `rate_limit_exceeded` | IP exceeds rate limits repeatedly | 5 events in 10 minutes |
| `payment_signature_invalid` | Invalid Razorpay payment signature | 3 events in 10 minutes |
| `webhook_signature_invalid` | Invalid webhook signature (Razorpay/Shiprocket) | 3 events in 10 minutes |
| `otp_brute_force` | Multiple failed OTP attempts | 10 events in 10 minutes |
| `unauthorized_access` | Unauthorized API access attempts | 5 events in 10 minutes |
| `admin_auth_failure` | Failed admin authentication | Manual review |

---

## Response Team & Contacts

### Primary Contact

- **Email:** trishikhaorganic@gmail.com
- **Role:** Business Owner / Security Lead

### Escalation Path

1. **Level 1:** Automated detection and alerting
2. **Level 2:** Security Dashboard review (admin)
3. **Level 3:** External security consultation (if needed)

### External Contacts

| Service | Contact | Purpose |
|---------|---------|---------|
| Razorpay Support | support@razorpay.com | Payment fraud |
| Supabase Support | support@supabase.io | Database security |
| Shiprocket Support | support@shiprocket.in | Logistics security |

---

## Detection Mechanisms

### Automated Detection

The system automatically detects and creates incidents when thresholds are exceeded:

```
Security Event → logSecurityEvent() → trackSecurityEvent() → detectAnomaly()
                                                                    ↓
                                                          Threshold exceeded?
                                                                    ↓
                                                         Create Incident + Alert
```

### Detection Configuration

Environment variables (`.env`):

```env
INCIDENT_RATE_LIMIT_THRESHOLD=5      # Events before incident
INCIDENT_RATE_LIMIT_WINDOW_MINS=10   # Time window for counting
INCIDENT_SIGNATURE_THRESHOLD=3        # Signature failures
INCIDENT_BRUTE_FORCE_THRESHOLD=10     # OTP/auth failures
INCIDENT_ALERT_EMAIL=trishikhaorganic@gmail.com
```

### Monitored Events

1. **Rate Limiting** - All API endpoints with rate limits
2. **Payment Verification** - Signature validation failures
3. **Webhook Processing** - Signature validation for Razorpay/Shiprocket
4. **OTP Verification** - Failed OTP attempts and lockouts
5. **Authentication** - Admin login failures

---

## Response Procedures

### 1. Rate Limit Incidents

**Detection:** IP address exceeds rate limit 5+ times in 10 minutes

**Response Steps:**

1. Review incident in Security Dashboard (`/admin/security`)
2. Check source IP for patterns (VPN, proxy, known bad actor)
3. Review associated endpoint for abuse patterns
4. Decision:
   - **Legitimate traffic spike:** Mark as False Positive
   - **Automated abuse:** Consider IP blocking at infrastructure level
   - **Attack pattern:** Escalate to High severity

### 2. Payment Signature Failures

**Detection:** 3+ invalid payment signatures from same IP

**Response Steps:**

1. **CRITICAL** - Respond within 15 minutes
2. Review affected orders in dashboard
3. Check Razorpay dashboard for corresponding transactions
4. Verify webhook secret configuration
5. If tampering suspected:
   - Temporarily disable affected payment flow
   - Contact Razorpay support
   - Document all affected transactions

### 3. Webhook Tampering

**Detection:** Invalid webhook signatures

**Response Steps:**

1. **CRITICAL** - Respond within 15 minutes
2. Verify webhook secrets in environment configuration
3. Check for IP spoofing (legitimate webhook sources: Razorpay, Shiprocket)
4. Review server access logs
5. If compromise suspected:
   - Rotate webhook secrets immediately
   - Audit all recent webhook-processed orders
   - Contact affected service provider

### 4. OTP Brute Force

**Detection:** 10+ failed OTP attempts for same order/IP

**Response Steps:**

1. Verify order lockout is active (automatic after 3 failures)
2. Review associated order for legitimacy
3. Check if customer contact email matches order email
4. Decision:
   - **Legitimate customer:** Assist with order access
   - **Suspicious activity:** Maintain lockout, monitor

### 5. Admin Authentication Failures

**Detection:** Multiple failed admin login attempts

**Response Steps:**

1. Review source IP addresses
2. Verify no admin account compromise
3. Check if affected admin was locked out
4. If compromise suspected:
   - Reset affected admin passwords
   - Enable additional auth factors
   - Audit recent admin actions

---

## Account Lockout Procedures

### Automatic Lockout

- **OTP Brute Force:** Order locked for 1 hour after 3 failed attempts
- **Admin Auth Failure:** Account can be locked via API

### Manual Lockout (Admin)

**Lock Account:**
```
POST /api/admin/account/lock
{
  "userId": "uuid",
  "reason": "Suspicious activity detected",
  "durationHours": 24
}
```

**Unlock Account:**
```
POST /api/admin/account/unlock
{
  "userId": "uuid"
}
```

### Lockout Review Process

1. Document reason for lockout
2. Attempt to contact account owner
3. Verify identity before unlocking
4. Monitor account after unlock for 24 hours

---

## Breach Notification Process

### GDPR Requirements (72-hour notification)

Under GDPR Article 33, the supervisory authority must be notified within 72 hours of becoming aware of a personal data breach.

### India DPDP Act Requirements

Similar notification requirements apply to the Data Protection Board of India.

### Notification Timeline

| Time | Action |
|------|--------|
| 0-1 hour | Contain breach, assess scope |
| 1-4 hours | Document affected data and users |
| 4-24 hours | Prepare notification content |
| 24-72 hours | Notify regulatory authorities (if required) |
| Post-notification | Notify affected users |

### Notification Templates

**User Notification** (via `sendBreachNotificationUser`):
- What happened
- Data potentially affected
- Recommended actions
- Contact information

**Internal Alert** (via `sendInternalSecurityAlert`):
- Incident ID and severity
- Technical details
- Required actions

**Regulatory Notification** (via `sendRegulatoryBreachNotification`):
- Incident overview
- Categories of data affected
- Risk assessment
- Containment actions taken

### Breach Assessment Questions

1. What type of data was potentially exposed?
2. How many records/users are affected?
3. Is the breach contained?
4. What is the risk to affected individuals?
5. Are regulatory notifications required?

---

## Post-Incident Review

### Review Checklist

- [ ] Incident fully documented in system
- [ ] Root cause identified
- [ ] Containment actions verified effective
- [ ] All affected users/systems identified
- [ ] Notifications sent (if required)
- [ ] Preventive measures implemented
- [ ] Security controls updated
- [ ] Team debriefed

### Documentation Requirements

1. **Incident Timeline:** Chronological events
2. **Impact Assessment:** Data/users affected
3. **Response Actions:** Steps taken
4. **Root Cause:** Why it happened
5. **Lessons Learned:** What to improve
6. **Follow-up Actions:** Preventive measures

### Updating Security Controls

After each significant incident:

1. Review detection thresholds
2. Update rate limiting if needed
3. Add new detection rules if pattern is new
4. Update this document with lessons learned

---

## Technical Reference

### Key Files

| File | Purpose |
|------|---------|
| `lib/incident.ts` | Core incident detection and management |
| `lib/logger.ts` | Security event logging with `trackSecurityEvent` |
| `lib/email.ts` | Breach notification email templates |
| `lib/auth.ts` | Account lockout enforcement |
| `app/api/admin/incidents/` | Incident management API |
| `components/SecurityDashboard.tsx` | Admin UI for incidents |

### Database Tables

**`security_incidents`:**
- `id` - UUID
- `incident_type` - Type of incident
- `severity` - low/medium/high/critical
- `source_ip` - Originating IP
- `order_id` - Associated order (if applicable)
- `admin_user_id` - Associated admin (if applicable)
- `guest_email` - Guest email for notifications
- `description` - Human-readable description
- `details` - JSON technical details
- `status` - open/investigating/resolved/false_positive
- `created_at` - Timestamp
- `resolved_at` - Resolution timestamp
- `resolved_by` - Admin who resolved
- `notes` - Investigation notes

**`user_role` (lockout columns):**
- `locked_until` - Account locked until this time
- `locked_reason` - Reason for lockout

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/incidents` | GET | List incidents |
| `/api/admin/incidents/[id]` | GET | Get incident details |
| `/api/admin/incidents/[id]` | PATCH | Update incident |
| `/api/admin/account/lock` | POST | Lock admin account |
| `/api/admin/account/unlock` | POST | Unlock admin account |

### Security Dashboard

Access: `/admin/security`

Features:
- View open incidents by severity
- Filter by status and type
- Update incident status
- Add investigation notes
- Link to related orders

---

## Appendix: Email Templates

### User Breach Notification

```
Subject: TrishikhaOrganics: Important Security Notice

Dear Customer,

We are writing to inform you about a security incident...

What Happened: [Description]

Information Affected:
- [List of data types]

Recommended Actions:
- [Action items]

Contact: trishikhaorganic@gmail.com
```

### Internal Security Alert

```
Subject: [SEVERITY] Security Incident - [Type]

Incident ID: [UUID]
Type: [Incident Type]
Severity: [Level]
Source IP: [IP Address]
Timestamp: [ISO Date]

Description: [Details]

Action Required: Review in admin dashboard.
```

---

## DPDP Act Compliance

### Zero Threshold Reporting

Under India's Digital Personal Data Protection Act (DPDP Act) 2023, **all personal data breaches must be reported to the Data Protection Board**, regardless of the number of affected individuals.

This differs from GDPR which allows a risk-based assessment before deciding to notify.

### CIA Triad Monitoring

The system monitors for breaches across the CIA triad:

| Category | Incident Types | Examples |
|----------|---------------|----------|
| **Confidentiality** | `bulk_data_export`, `unauthorized_data_access` | Large SELECT queries, accessing other users' data |
| **Integrity** | `data_modification_anomaly`, `schema_change_detected` | Unusual UPDATE/DELETE patterns, DDL outside deployment |
| **Availability** | `service_disruption`, `data_deletion_alert`, `backup_failure` | DDoS, large DELETE operations, backup issues |

### DPB Notification Process

1. **Detection**: System automatically creates incidents when thresholds are exceeded
2. **Assessment**: Admin reviews incident in Security Dashboard (`/admin/security`)
3. **Classification**: Determine if incident involves personal data
4. **Generate Report**: Use `sendDPBBreachNotification()` to generate notification template
5. **Submit to DPB**: File notification with Data Protection Board of India
6. **Notify Data Principals**: Inform affected individuals as required

### Required Information for DPB Notification

| Field | Description |
|-------|-------------|
| Incident ID | Internal reference number |
| Breach Type | Confidentiality / Integrity / Availability |
| Discovery Date | When the breach was detected |
| Affected Data Principals | Number of affected individuals |
| Data Categories | Types of personal data involved |
| Breach Description | What happened |
| Containment Measures | Steps taken to contain the breach |
| Risk Mitigation | Measures to reduce harm |

### Audit Logging

All data operations are logged in `audit_log` table for compliance:

```typescript
// Log data access
import { logDataAccess } from '@/lib/audit';

await logDataAccess({
  tableName: 'orders',
  operation: 'SELECT',
  userId: user.id,
  userRole: 'admin',
  ip: request.ip,
  rowCount: 50,
  endpoint: '/api/orders',
});
```

### Vendor Breach Tracking

Third-party vendor breaches are tracked in `vendor_breach_log`:

```typescript
import { logVendorBreach } from '@/lib/audit';

await logVendorBreach({
  vendorName: 'razorpay',
  breachDescription: 'Payment data exposed',
  affectedDataTypes: ['email', 'payment_info'],
  vendorNotifiedUsAt: new Date(),
  riskLevel: 'high',
});
```

### Environment Variables for DPDP

```env
# Audit logging thresholds
AUDIT_BULK_SELECT_THRESHOLD=100    # Rows before bulk SELECT alert
AUDIT_BULK_DELETE_THRESHOLD=10     # Rows before bulk DELETE alert
AUDIT_BULK_UPDATE_THRESHOLD=50     # Rows before bulk UPDATE alert

# Incident alert email
INCIDENT_ALERT_EMAIL=trishikhaorganic@gmail.com
```

---

*This document should be reviewed and updated quarterly or after any significant security incident.*
