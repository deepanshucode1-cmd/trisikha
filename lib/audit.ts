/**
 * Audit Logging Utility for DPDP Act Compliance
 * Tracks data access and modifications for CIA triad monitoring
 */

import { createServiceClient } from "@/utils/supabase/service";
import { logError } from "@/lib/logger";

// Types
export type AuditOperation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";
export type QueryType = "single" | "bulk" | "export";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type RemediationStatus = "pending" | "in_progress" | "completed";

export interface AuditLogEntry {
  tableName: string;
  operation: AuditOperation;
  userId?: string;
  userRole?: string;
  ip?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  queryType?: QueryType;
  rowCount?: number;
  endpoint?: string;
  reason?: string;
}

export interface VendorBreachEntry {
  vendorName: "razorpay" | "shiprocket" | "supabase" | string;
  breachDescription: string;
  affectedDataTypes: string[];
  breachOccurredAt?: Date;
  vendorNotifiedUsAt: Date;
  affectedUserCount?: number;
  riskLevel: RiskLevel;
  containmentActions?: string[];
  vendorReferenceId?: string;
  internalIncidentId?: string;
  notes?: string;
}

// Thresholds for bulk operation detection
const BULK_THRESHOLDS = {
  SELECT: parseInt(process.env.AUDIT_BULK_SELECT_THRESHOLD || "100"),
  DELETE: parseInt(process.env.AUDIT_BULK_DELETE_THRESHOLD || "10"),
  UPDATE: parseInt(process.env.AUDIT_BULK_UPDATE_THRESHOLD || "50"),
  INSERT: parseInt(process.env.AUDIT_BULK_INSERT_THRESHOLD || "50"),
};

/**
 * Log a data access or modification event
 * Use this for DPDP compliance tracking
 */
export async function logDataAccess(entry: AuditLogEntry): Promise<string | null> {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("audit_log")
      .insert({
        table_name: entry.tableName,
        operation: entry.operation,
        user_id: entry.userId || null,
        user_role: entry.userRole || "anonymous",
        ip_address: entry.ip || null,
        old_data: entry.oldData || null,
        new_data: entry.newData || null,
        query_type: entry.queryType || "single",
        row_count: entry.rowCount || 1,
        endpoint: entry.endpoint || null,
        reason: entry.reason || null,
      })
      .select("id")
      .single();

    if (error) {
      logError(error as Error, { context: "audit_log_insert_failed", entry });
      return null;
    }

    // Check for bulk operation and create incident if threshold exceeded
    await checkBulkOperationThreshold(entry);

    return data?.id || null;
  } catch (err) {
    logError(err as Error, { context: "audit_log_error", entry });
    return null;
  }
}

/**
 * Check if an operation exceeds bulk thresholds and create incident if needed
 */
async function checkBulkOperationThreshold(entry: AuditLogEntry): Promise<void> {
  const threshold = BULK_THRESHOLDS[entry.operation];
  const rowCount = entry.rowCount || 1;

  if (rowCount < threshold) return;

  try {
    // Dynamic import to avoid circular dependency
    const { createIncident } = await import("./incident");

    // Determine incident type based on operation
    let incidentType: string;
    let severity: "low" | "medium" | "high" | "critical";

    switch (entry.operation) {
      case "DELETE":
        incidentType = "data_deletion_alert";
        severity = rowCount >= threshold * 2 ? "high" : "medium";
        break;
      case "SELECT":
        incidentType = "bulk_data_export";
        severity = rowCount >= threshold * 3 ? "high" : "medium";
        break;
      case "UPDATE":
        incidentType = "data_modification_anomaly";
        severity = rowCount >= threshold * 2 ? "high" : "medium";
        break;
      default:
        incidentType = "suspicious_pattern";
        severity = "low";
    }

    await createIncident({
      incident_type: incidentType as Parameters<typeof createIncident>[0]["incident_type"],
      severity,
      source_ip: entry.ip,
      admin_user_id: entry.userId,
      endpoint: entry.endpoint,
      description: `Bulk ${entry.operation} operation detected: ${rowCount} rows on ${entry.tableName}`,
      details: {
        tableName: entry.tableName,
        operation: entry.operation,
        rowCount,
        threshold,
        userRole: entry.userRole,
      },
    });
  } catch (err) {
    logError(err as Error, { context: "bulk_threshold_check_error" });
  }
}

/**
 * Log a vendor breach notification
 * Use this when a third-party vendor notifies of a data breach
 */
export async function logVendorBreach(entry: VendorBreachEntry): Promise<string | null> {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("vendor_breach_log")
      .insert({
        vendor_name: entry.vendorName,
        breach_description: entry.breachDescription,
        affected_data_types: entry.affectedDataTypes,
        breach_occurred_at: entry.breachOccurredAt?.toISOString() || null,
        vendor_notified_us_at: entry.vendorNotifiedUsAt.toISOString(),
        affected_user_count: entry.affectedUserCount || null,
        risk_level: entry.riskLevel,
        containment_actions: entry.containmentActions || null,
        remediation_status: "pending",
        vendor_reference_id: entry.vendorReferenceId || null,
        internal_incident_id: entry.internalIncidentId || null,
        notes: entry.notes || null,
      })
      .select("id")
      .single();

    if (error) {
      logError(error as Error, { context: "vendor_breach_log_insert_failed", entry });
      return null;
    }

    // Create a corresponding security incident
    const { createIncident } = await import("./incident");
    await createIncident({
      incident_type: "suspicious_pattern", // Using existing type
      severity: entry.riskLevel,
      description: `Vendor breach notification: ${entry.vendorName} - ${entry.breachDescription}`,
      details: {
        vendorName: entry.vendorName,
        affectedDataTypes: entry.affectedDataTypes,
        affectedUserCount: entry.affectedUserCount,
        breachLogId: data?.id,
      },
    });

    return data?.id || null;
  } catch (err) {
    logError(err as Error, { context: "vendor_breach_log_error", entry });
    return null;
  }
}

/**
 * Update vendor breach remediation status
 */
export async function updateVendorBreachStatus(
  breachId: string,
  updates: {
    remediationStatus?: RemediationStatus;
    weNotifiedDpbAt?: Date;
    usersNotifiedAt?: Date;
    containmentActions?: string[];
    notes?: string;
  }
): Promise<boolean> {
  try {
    const supabase = createServiceClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.remediationStatus) {
      updateData.remediation_status = updates.remediationStatus;
    }
    if (updates.weNotifiedDpbAt) {
      updateData.we_notified_dpb_at = updates.weNotifiedDpbAt.toISOString();
    }
    if (updates.usersNotifiedAt) {
      updateData.users_notified_at = updates.usersNotifiedAt.toISOString();
    }
    if (updates.containmentActions) {
      updateData.containment_actions = updates.containmentActions;
    }
    if (updates.notes) {
      updateData.notes = updates.notes;
    }

    const { error } = await supabase
      .from("vendor_breach_log")
      .update(updateData)
      .eq("id", breachId);

    if (error) {
      logError(error as Error, { context: "vendor_breach_update_failed", breachId });
      return false;
    }

    return true;
  } catch (err) {
    logError(err as Error, { context: "vendor_breach_update_error", breachId });
    return false;
  }
}

/**
 * Get audit log entries for a specific time period
 * Useful for compliance reporting
 */
export async function getAuditLog(params: {
  tableName?: string;
  operation?: AuditOperation;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  try {
    const supabase = createServiceClient();

    let query = supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false });

    if (params.tableName) {
      query = query.eq("table_name", params.tableName);
    }
    if (params.operation) {
      query = query.eq("operation", params.operation);
    }
    if (params.userId) {
      query = query.eq("user_id", params.userId);
    }
    if (params.startDate) {
      query = query.gte("created_at", params.startDate.toISOString());
    }
    if (params.endDate) {
      query = query.lte("created_at", params.endDate.toISOString());
    }
    if (params.limit) {
      query = query.limit(params.limit);
    } else {
      query = query.limit(100); // Default limit
    }

    const { data, error } = await query;

    if (error) {
      logError(error as Error, { context: "audit_log_fetch_failed" });
      return [];
    }

    return data || [];
  } catch (err) {
    logError(err as Error, { context: "audit_log_fetch_error" });
    return [];
  }
}
