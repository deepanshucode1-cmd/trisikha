import { Redis } from "@upstash/redis";
import { createServiceClient } from "@/utils/supabase/service";
import { logSecurityEvent, logError } from "./logger";

// --- Types ---

export type IncidentType =
  // Existing types
  | "rate_limit_exceeded"
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

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type IncidentStatus = "open" | "investigating" | "resolved" | "false_positive";

export type DpbBreachType = "confidentiality" | "integrity" | "availability";

export interface Incident {
  id?: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  source_ip?: string;
  order_id?: string;
  admin_user_id?: string;
  guest_email?: string;
  endpoint?: string;
  description: string;
  details?: Record<string, unknown>;
  status?: IncidentStatus;
  created_at?: string;
  is_personal_data_breach?: boolean | null;
  dpb_breach_type?: string | null;
  dpb_notified_at?: string | null;
  dpb_report_generated_at?: string | null;
}

export interface IncidentConfig {
  rateLimitThreshold: number;
  rateLimitWindowMins: number;
  signatureThreshold: number;
  bruteForceThreshold: number;
  alertEmail: string;
}

// --- Configuration ---

export function getIncidentConfig(): IncidentConfig {
  return {
    rateLimitThreshold: parseInt(process.env.INCIDENT_RATE_LIMIT_THRESHOLD || "5"),
    rateLimitWindowMins: parseInt(process.env.INCIDENT_RATE_LIMIT_WINDOW_MINS || "10"),
    signatureThreshold: parseInt(process.env.INCIDENT_SIGNATURE_THRESHOLD || "3"),
    bruteForceThreshold: parseInt(process.env.INCIDENT_BRUTE_FORCE_THRESHOLD || "10"),
    alertEmail: process.env.INCIDENT_ALERT_EMAIL || "trishikhaorganic@gmail.com",
  };
}

// --- Redis / In-Memory Counter ---

const hasRedisCredentials = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = hasRedisCredentials ? Redis.fromEnv() : null;

// In-memory fallback for development
const inMemoryCounters: Map<string, { count: number; expiresAt: number }> = new Map();

async function incrementCounter(key: string, windowMs: number): Promise<number> {
  if (redis) {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, windowMs);
    }
    return count;
  }

  // In-memory fallback
  const now = Date.now();
  const existing = inMemoryCounters.get(key);

  if (existing && existing.expiresAt > now) {
    existing.count++;
    return existing.count;
  }

  // New counter or expired
  inMemoryCounters.set(key, { count: 1, expiresAt: now + windowMs });

  // Cleanup expired entries
  for (const [k, v] of inMemoryCounters.entries()) {
    if (v.expiresAt <= now) {
      inMemoryCounters.delete(k);
    }
  }

  return 1;
}

async function getCounter(key: string): Promise<number> {
  if (redis) {
    const count = await redis.get<number>(key);
    return count || 0;
  }

  const existing = inMemoryCounters.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    return existing.count;
  }
  return 0;
}

// --- Incident CRUD Operations ---

/**
 * Create a new security incident in the database
 */
export async function createIncident(incident: Omit<Incident, "id" | "created_at">): Promise<string> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("security_incidents")
    .insert({
      incident_type: incident.incident_type,
      severity: incident.severity,
      source_ip: incident.source_ip,
      order_id: incident.order_id,
      admin_user_id: incident.admin_user_id,
      guest_email: incident.guest_email,
      endpoint: incident.endpoint,
      description: incident.description,
      details: incident.details || {},
      status: incident.status || "open",
    })
    .select("id")
    .single();

  if (error) {
    logError(new Error(error.message), { context: "create_incident", incident });
    throw error;
  }

  logSecurityEvent("incident_created", {
    incidentId: data.id,
    type: incident.incident_type,
    severity: incident.severity,
    ip: incident.source_ip,
  });

  // Trigger IP blocking if incident has a source IP
  if (incident.source_ip) {
    try {
      const { blockIp } = await import("./ip-blocking");
      await blockIp({
        ip: incident.source_ip,
        incidentType: incident.incident_type,
        severity: incident.severity,
        incidentId: data.id,
        endpoint: incident.endpoint,
      });
    } catch (err) {
      logError(err as Error, { context: "auto_ip_block_failed", incidentId: data.id });
    }
  }

  return data.id;
}

/**
 * Update an incident's status and/or notes
 */
export async function updateIncident(
  incidentId: string,
  updates: {
    status?: IncidentStatus;
    notes?: string;
    resolved_by?: string;
    is_personal_data_breach?: boolean | null;
    dpb_breach_type?: DpbBreachType | null;
    dpb_notified_at?: string | null;
    dpb_report_generated_at?: string | null;
  }
): Promise<void> {
  const supabase = createServiceClient();

  const updateData: Record<string, unknown> = { ...updates };
  if (updates.status === "resolved" || updates.status === "false_positive") {
    updateData.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("security_incidents")
    .update(updateData)
    .eq("id", incidentId);

  if (error) {
    logError(new Error(error.message), { context: "update_incident", incidentId, updates });
    throw error;
  }

  logSecurityEvent("incident_updated", { incidentId, ...updates });
}

/**
 * Generate a DPB breach report email and stamp the incident
 */
export async function generateDpbReport(
  incidentId: string,
  params: {
    breachType: DpbBreachType;
    affectedDataPrincipals: number;
    dataCategories: string[];
    breachDescription: string;
    containmentMeasures: string[];
    riskMitigation: string[];
    likelyConsequences?: string;
    transferToThirdParty?: boolean;
    crossBorderTransfer?: boolean;
  }
): Promise<void> {
  const { sendDPBBreachNotification } = await import("./email");

  const sent = await sendDPBBreachNotification({
    incidentId,
    breachType: params.breachType,
    discoveryDate: new Date(),
    affectedDataPrincipals: params.affectedDataPrincipals,
    dataCategories: params.dataCategories,
    breachDescription: params.breachDescription,
    containmentMeasures: params.containmentMeasures,
    riskMitigation: params.riskMitigation,
    likelyConsequences: params.likelyConsequences,
    transferToThirdParty: params.transferToThirdParty,
    crossBorderTransfer: params.crossBorderTransfer,
  });

  if (!sent) {
    throw new Error("Failed to send DPB breach notification email");
  }

  await updateIncident(incidentId, {
    dpb_report_generated_at: new Date().toISOString(),
  });

  logSecurityEvent("dpb_report_generated", { incidentId, breachType: params.breachType });
}

/**
 * Get open incidents for dashboard
 */
export async function getIncidents(filters?: {
  status?: IncidentStatus | "all";
  severity?: IncidentSeverity;
  type?: IncidentType;
  limit?: number;
  offset?: number;
}): Promise<{ incidents: Incident[]; total: number }> {
  const supabase = createServiceClient();

  let query = supabase
    .from("security_incidents")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters?.severity) {
    query = query.eq("severity", filters.severity);
  }
  if (filters?.type) {
    query = query.eq("incident_type", filters.type);
  }

  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    logError(new Error(error.message), { context: "get_incidents", filters });
    throw error;
  }

  return { incidents: data || [], total: count || 0 };
}

// --- Anomaly Detection ---

/**
 * Severity mapping for different event types
 */
function getSeverityForEvent(eventType: string): IncidentSeverity {
  const criticalEvents = [
    "webhook_signature_invalid",
    "payment_signature_invalid",
    "schema_change_detected",  // CIA - Integrity
    "service_disruption",      // CIA - Availability
  ];
  const highEvents = [
    "otp_brute_force",
    "admin_auth_failure",
    "bulk_data_export",        // CIA - Confidentiality
    "data_deletion_alert",     // CIA - Availability
    "unauthorized_data_access", // CIA - Confidentiality
  ];
  const mediumEvents = [
    "rate_limit_exceeded",
    "unauthorized_access",
    "data_modification_anomaly", // CIA - Integrity
    "backup_failure",            // CIA - Availability
  ];

  if (criticalEvents.includes(eventType)) return "critical";
  if (highEvents.includes(eventType)) return "high";
  if (mediumEvents.includes(eventType)) return "medium";
  return "low";
}

/**
 * Map security event names to incident types
 */
function mapEventToIncidentType(event: string): IncidentType {
  const mapping: Record<string, IncidentType> = {
    rate_limit_exceeded: "rate_limit_exceeded",
    payment_signature_invalid: "payment_signature_invalid",
    webhook_signature_invalid: "webhook_signature_invalid",
    invalid_webhook_signature: "webhook_signature_invalid",
    invalid_shiprocket_webhook_token: "webhook_signature_invalid",
    otp_account_locked: "otp_brute_force",
    otp_verification_failed: "otp_brute_force",
    unauthorized_access: "unauthorized_access",
    unauthorized_order_access: "unauthorized_access",
  };

  return mapping[event] || "suspicious_pattern";
}

/**
 * Check if an event should trigger an incident based on thresholds
 */
export async function detectAnomaly(params: {
  eventType: string;
  ip?: string;
  userId?: string;
  orderId?: string;
  endpoint?: string;
  details?: Record<string, unknown>;
}): Promise<boolean> {
  const config = getIncidentConfig();
  const windowMs = config.rateLimitWindowMins * 60 * 1000;
  const { eventType, ip, userId, orderId, endpoint, details } = params;

  // Determine counter key based on event type
  let counterKey: string;
  let threshold: number;

  switch (eventType) {
    case "rate_limit_exceeded":
      counterKey = `incident:ratelimit:${ip}`;
      threshold = config.rateLimitThreshold;
      break;

    case "payment_signature_invalid":
    case "webhook_signature_invalid":
    case "invalid_webhook_signature":
    case "invalid_shiprocket_webhook_token":
      counterKey = `incident:signature:${ip}`;
      threshold = config.signatureThreshold;
      break;

    case "otp_account_locked":
    case "otp_verification_failed":
      counterKey = `incident:bruteforce:${orderId || ip}`;
      threshold = config.bruteForceThreshold;
      break;

    case "unauthorized_access":
    case "unauthorized_order_access":
      counterKey = `incident:unauth:${ip}`;
      threshold = config.rateLimitThreshold;
      break;

    default:
      // Don't track unknown events
      return false;
  }

  // Increment counter and check threshold
  const count = await incrementCounter(counterKey, windowMs);

  if (count >= threshold) {
    // Only create incident on exact threshold hit (avoid duplicates)
    if (count === threshold) {
      const incidentType = mapEventToIncidentType(eventType);
      const severity = getSeverityForEvent(eventType);

      await createIncident({
        incident_type: incidentType,
        severity,
        source_ip: ip,
        order_id: orderId,
        endpoint,
        description: `${incidentType} threshold exceeded: ${count} events in ${config.rateLimitWindowMins} minutes`,
        details: {
          ...details,
          threshold,
          count,
          windowMins: config.rateLimitWindowMins,
        },
      });

      return true;
    }
  }

  return false;
}

// --- Account Lockout (Admin accounts only) ---

/**
 * Lock an admin account
 */
export async function lockAccount(
  userId: string,
  reason: string,
  durationHours: number = 24
): Promise<void> {
  const supabase = createServiceClient();

  const lockedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  const { error } = await supabase
    .from("user_role")
    .update({
      locked_until: lockedUntil.toISOString(),
      locked_reason: reason,
    })
    .eq("id", userId);

  if (error) {
    logError(new Error(error.message), { context: "lock_account", userId, reason });
    throw error;
  }

  // Create incident for account lockout
  await createIncident({
    incident_type: "admin_auth_failure",
    severity: "high",
    admin_user_id: userId,
    description: `Admin account locked: ${reason}`,
    details: { lockedUntil: lockedUntil.toISOString(), durationHours },
  });

  logSecurityEvent("account_locked", { userId, reason, lockedUntil: lockedUntil.toISOString() });
}

/**
 * Unlock an admin account
 */
export async function unlockAccount(userId: string, adminId: string): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("user_role")
    .update({
      locked_until: null,
      locked_reason: null,
    })
    .eq("id", userId);

  if (error) {
    logError(new Error(error.message), { context: "unlock_account", userId });
    throw error;
  }

  logSecurityEvent("account_unlocked", { userId, unlockedBy: adminId });
}

/**
 * Check if an admin account is locked
 */
export async function isAccountLocked(userId: string): Promise<{
  locked: boolean;
  lockedUntil?: string;
  reason?: string;
}> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("user_role")
    .select("locked_until, locked_reason")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return { locked: false };
  }

  if (data.locked_until) {
    const lockedUntil = new Date(data.locked_until);
    if (lockedUntil > new Date()) {
      return {
        locked: true,
        lockedUntil: data.locked_until,
        reason: data.locked_reason,
      };
    }
  }

  return { locked: false };
}

// --- Incident Statistics ---

/**
 * Get incident counts by severity for dashboard badges
 */
export async function getIncidentStats(): Promise<Record<IncidentSeverity, number>> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("security_incidents")
    .select("severity")
    .eq("status", "open");

  if (error) {
    logError(new Error(error.message), { context: "get_incident_stats" });
    return { low: 0, medium: 0, high: 0, critical: 0 };
  }

  const stats: Record<IncidentSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const row of data || []) {
    if (row.severity in stats) {
      stats[row.severity as IncidentSeverity]++;
    }
  }

  return stats;
}
