/**
 * Grievance Redressal Service
 * DPDP Rules 2025 Rule 14(3) - Grievance Redressal
 *
 * Flow:
 * 1. OTP-verified guest with confirmed orders submits a grievance
 * 2. System sets 90-day SLA deadline
 * 3. Admin reviews, triages, and resolves grievances
 * 4. All actions are audit-logged for compliance
 */

import { createServiceClient } from "@/utils/supabase/service";
import { logError, logSecurityEvent } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";

// Types
export type GrievanceStatus = "open" | "in_progress" | "resolved" | "closed";
export type GrievanceCategory =
  | "data_processing"
  | "correction"
  | "deletion"
  | "consent"
  | "breach"
  | "other";
export type GrievancePriority = "low" | "medium" | "high";

export interface Grievance {
  id: string;
  email: string;
  subject: string;
  description: string;
  category: GrievanceCategory;
  status: GrievanceStatus;
  priority: GrievancePriority;
  admin_notes: string | null;
  resolution_notes: string | null;
  sla_deadline: string;
  resolved_at: string | null;
  resolved_by: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateGrievanceParams {
  email: string;
  subject: string;
  description: string;
  category: GrievanceCategory;
  ip: string;
  userAgent?: string;
}

export interface UpdateGrievanceParams {
  grievanceId: string;
  status?: GrievanceStatus;
  priority?: GrievancePriority;
  adminNotes?: string;
  resolutionNotes?: string;
  adminId: string;
}

/**
 * Create a new grievance with 90-day SLA deadline
 */
export async function createGrievance(
  params: CreateGrievanceParams
): Promise<{ grievanceId: string; slaDeadline: string }> {
  const supabase = createServiceClient();
  const normalizedEmail = params.email.toLowerCase().trim();

  // Calculate SLA deadline: now + 90 days
  const now = new Date();
  const slaDeadline = new Date(now);
  slaDeadline.setDate(slaDeadline.getDate() + 90);

  const { data, error } = await supabase
    .from("grievances")
    .insert({
      email: normalizedEmail,
      subject: params.subject,
      description: params.description,
      category: params.category,
      sla_deadline: slaDeadline.toISOString(),
      ip_address: params.ip,
      user_agent: params.userAgent || null,
    })
    .select("id, sla_deadline")
    .single();

  if (error) {
    logError(error as Error, {
      context: "create_grievance_failed",
      email: normalizedEmail,
    });
    throw new Error("Failed to create grievance");
  }

  await logDataAccess({
    tableName: "grievances",
    operation: "INSERT",
    rowCount: 1,
    userId: "system:guest_grievance",
    endpoint: "/api/guest/grievance",
    newData: {
      email: normalizedEmail,
      subject: params.subject,
      category: params.category,
    },
    reason: `DPDP Rule 14(3) grievance filed by ${normalizedEmail}`,
  });

  logSecurityEvent("grievance_created", {
    grievanceId: data.id,
    email: normalizedEmail,
    category: params.category,
    slaDeadline: data.sla_deadline,
    ip: params.ip,
  });

  return { grievanceId: data.id, slaDeadline: data.sla_deadline };
}

/**
 * Get grievances for a specific email (guest view)
 */
export async function getGrievancesByEmail(
  email: string
): Promise<Grievance[]> {
  const supabase = createServiceClient();
  const normalizedEmail = email.toLowerCase().trim();

  const { data, error } = await supabase
    .from("grievances")
    .select("*")
    .eq("email", normalizedEmail)
    .order("created_at", { ascending: false });

  if (error) {
    logError(error as Error, {
      context: "get_grievances_by_email_failed",
      email: normalizedEmail,
    });
    return [];
  }

  return (data as Grievance[]) || [];
}

/**
 * Get all grievances with optional filters (admin use)
 */
export async function getGrievances(params?: {
  status?: GrievanceStatus;
  email?: string;
  category?: GrievanceCategory;
  limit?: number;
  offset?: number;
}): Promise<{ grievances: Grievance[]; total: number }> {
  const supabase = createServiceClient();

  let query = supabase
    .from("grievances")
    .select("*", { count: "exact" });

  if (params?.status) {
    query = query.eq("status", params.status);
  }

  if (params?.email) {
    query = query.ilike("email", `%${params.email}%`);
  }

  if (params?.category) {
    query = query.eq("category", params.category);
  }

  query = query.order("created_at", { ascending: false });

  if (params?.limit) {
    query = query.limit(params.limit);
  }

  if (params?.offset) {
    query = query.range(
      params.offset,
      params.offset + (params?.limit || 20) - 1
    );
  }

  const { data, error, count } = await query;

  if (error) {
    logError(error as Error, { context: "get_grievances_failed" });
    return { grievances: [], total: 0 };
  }

  return {
    grievances: (data as Grievance[]) || [],
    total: count || 0,
  };
}

/**
 * Get a single grievance by ID (admin use)
 */
export async function getGrievanceById(
  id: string
): Promise<Grievance | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("grievances")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Grievance;
}

/**
 * Update a grievance (admin action)
 * Sets resolved_at + resolved_by when status changes to resolved/closed
 */
export async function updateGrievance(
  params: UpdateGrievanceParams
): Promise<{ success: boolean; message: string }> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // Fetch current grievance
  const { data: existing, error: fetchError } = await supabase
    .from("grievances")
    .select("*")
    .eq("id", params.grievanceId)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Grievance not found" };
  }

  const updateData: Record<string, unknown> = {
    updated_at: now,
  };

  if (params.status) {
    updateData.status = params.status;

    // Set resolved_at and resolved_by when resolving/closing
    if (
      (params.status === "resolved" || params.status === "closed") &&
      existing.status !== "resolved" &&
      existing.status !== "closed"
    ) {
      updateData.resolved_at = now;
      updateData.resolved_by = params.adminId;
    }
  }

  if (params.priority) {
    updateData.priority = params.priority;
  }

  if (params.adminNotes !== undefined) {
    updateData.admin_notes = params.adminNotes;
  }

  if (params.resolutionNotes !== undefined) {
    updateData.resolution_notes = params.resolutionNotes;
  }

  const { error: updateError } = await supabase
    .from("grievances")
    .update(updateData)
    .eq("id", params.grievanceId);

  if (updateError) {
    logError(updateError as Error, {
      context: "update_grievance_failed",
      grievanceId: params.grievanceId,
    });
    return { success: false, message: "Failed to update grievance" };
  }

  await logDataAccess({
    tableName: "grievances",
    operation: "UPDATE",
    rowCount: 1,
    userId: params.adminId,
    endpoint: "/api/admin/grievances/[id]",
    oldData: { status: existing.status, priority: existing.priority },
    newData: updateData,
    reason: `Admin updated grievance ${params.grievanceId} for ${existing.email}`,
  });

  logSecurityEvent("grievance_updated", {
    grievanceId: params.grievanceId,
    email: existing.email,
    oldStatus: existing.status,
    newStatus: params.status || existing.status,
    adminId: params.adminId,
  });

  return { success: true, message: "Grievance updated successfully" };
}

/**
 * Get grievance statistics (admin dashboard)
 */
export async function getGrievanceStats(): Promise<{
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  overdue: number;
}> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("grievances")
    .select("status, sla_deadline");

  if (error) {
    logError(error as Error, { context: "get_grievance_stats_failed" });
    return { open: 0, inProgress: 0, resolved: 0, closed: 0, overdue: 0 };
  }

  const now = new Date();
  const stats = { open: 0, inProgress: 0, resolved: 0, closed: 0, overdue: 0 };

  for (const row of data || []) {
    if (row.status === "open") stats.open++;
    else if (row.status === "in_progress") stats.inProgress++;
    else if (row.status === "resolved") stats.resolved++;
    else if (row.status === "closed") stats.closed++;

    // Count overdue: open or in_progress and past SLA deadline
    if (
      (row.status === "open" || row.status === "in_progress") &&
      new Date(row.sla_deadline) < now
    ) {
      stats.overdue++;
    }
  }

  return stats;
}
