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
export type GrievanceStatus =
  | "open"
  | "in_progress"
  | "awaiting_user_response"
  | "closed";
export type GrievanceCategory =
  | "data_processing"
  | "correction"
  | "deletion"
  | "consent"
  | "breach"
  | "other";
export type GrievancePriority = "low" | "medium" | "high";
export type ClosedByRole = "user" | "admin" | "auto_silence";
export type MessageAuthorRole = "user" | "admin";

export interface GrievanceMessage {
  id: string;
  grievance_id: string;
  author_role: MessageAuthorRole;
  author_id: string | null; // NULL for guest authors
  body: string | null; // nullable: cron may anonymise user-authored rows
  /**
   * true when admin proposes closing the grievance — drives
   * status → awaiting_user_response and shows accept/dispute CTAs to user.
   * Always false for guest-authored rows.
   */
  proposes_close: boolean;
  anonymised_at: string | null;
  created_at: string;
}

export interface Grievance {
  id: string;
  email: string;
  subject: string;
  description: string;
  category: GrievanceCategory;
  status: GrievanceStatus;
  priority: GrievancePriority;
  sla_deadline: string;
  ip_address: string | null;
  user_agent: string | null;
  // New acceptance-workflow columns (20260517150000 migration). The legacy
  // `resolved_at`, `resolved_by`, `resolution_notes`, `admin_notes`
  // columns were dropped in the same migration — message thread + closed_at
  // + closed_by_role cover their purposes.
  closed_at: string | null;
  closed_by_role: ClosedByRole | null;
  awaiting_since: string | null;
  silence_reminder_sent_at: string | null;
  force_close_reason: string | null;
  created_at: string;
  updated_at: string;
  // Eager-loaded thread when getters are called with { withMessages: true }
  messages?: GrievanceMessage[];
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
  priority: GrievancePriority;
  adminId: string;
}

export interface PostAdminMessageParams {
  grievanceId: string;
  adminId: string;
  body: string;
  /**
   * When true, this message is admin's proposal to close the grievance —
   * transitions status to `awaiting_user_response`. When false, it's a
   * clarification message (T2/T3/T9). See plan §1.
   */
  proposesClose: boolean;
}

export interface PostUserDisputeParams {
  grievanceId: string;
  body: string;
}

export interface AcceptResolutionParams {
  grievanceId: string;
  // No body field by design: a parting message from the user on closure
  // would let the thread end on a toxic or abusive note. Acceptance is
  // silent — the closure is signal enough. If the user wants to say
  // something, they have the dispute path while still in
  // awaiting_user_response.
}

export interface ForceCloseParams {
  grievanceId: string;
  adminId: string;
  reason: string;
}

export interface MutationResult {
  success: boolean;
  message: string;
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
 * Get grievances for a specific email (guest view).
 *
 * Pass `{ withMessages: true }` to eager-load the per-grievance thread —
 * used by the guest /grievance page to render the conversation inline.
 */
export async function getGrievancesByEmail(
  email: string,
  options: { withMessages?: boolean } = {}
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

  const grievances = (data as Grievance[]) || [];

  if (options.withMessages && grievances.length > 0) {
    await attachMessages(supabase, grievances);
  }

  return grievances;
}

/**
 * Load message threads for the given grievances in a single query and
 * attach them as `.messages` on each row. Mutates the input array.
 */
async function attachMessages(
  supabase: ReturnType<typeof createServiceClient>,
  grievances: Grievance[]
): Promise<void> {
  const ids = grievances.map((g) => g.id);

  const { data: messages, error } = await supabase
    .from("grievance_messages")
    .select("*")
    .in("grievance_id", ids)
    .order("created_at", { ascending: true });

  if (error) {
    logError(error as Error, {
      context: "attach_grievance_messages_failed",
    });
    for (const g of grievances) g.messages = [];
    return;
  }

  const byGrievance = new Map<string, GrievanceMessage[]>();
  for (const m of (messages as GrievanceMessage[]) || []) {
    const list = byGrievance.get(m.grievance_id) || [];
    list.push(m);
    byGrievance.set(m.grievance_id, list);
  }

  for (const g of grievances) {
    g.messages = byGrievance.get(g.id) || [];
  }
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
 * Get a single grievance by ID (admin use).
 *
 * Pass `{ withMessages: true }` to eager-load the message thread.
 */
export async function getGrievanceById(
  id: string,
  options: { withMessages?: boolean } = {}
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

  const grievance = data as Grievance;

  if (options.withMessages) {
    await attachMessages(supabase, [grievance]);
  }

  return grievance;
}

/**
 * Update a grievance's priority (admin triage).
 *
 * This is the only field the admin PATCH endpoint can still set directly.
 * Status changes go through the dedicated transition functions
 * (postAdminMessage, postUserDispute, acceptResolution, forceClose).
 * admin_notes and resolution_notes were dropped in the
 * grievance_acceptance_workflow migration; admin operational text lives
 * in the message thread now.
 */
export async function updateGrievance(
  params: UpdateGrievanceParams
): Promise<MutationResult> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: existing, error: fetchError } = await supabase
    .from("grievances")
    .select("id, email, priority")
    .eq("id", params.grievanceId)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Grievance not found" };
  }

  const updateData = {
    priority: params.priority,
    updated_at: now,
  };

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
    oldData: { priority: existing.priority },
    newData: updateData,
    reason: `Admin updated priority for grievance ${params.grievanceId}`,
  });

  logSecurityEvent("grievance_priority_updated", {
    grievanceId: params.grievanceId,
    email: existing.email,
    adminId: params.adminId,
  });

  return { success: true, message: "Priority updated" };
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

// ─── State-transition functions ──────────────────────────────────────────────
// Each function loads the current row, checks the precondition, optionally
// inserts a message, then UPDATEs the grievance. See plan §1 for the
// transition table.

/**
 * Admin posts a message on a grievance (T2 / T3 / T4a / T4b / T4c / T9).
 *
 * Rejected on a closed grievance. The new state and silence-clock columns
 * are derived from the current status and the `proposesClose` flag — see
 * plan §1 transition table. `closed_at` is never written here; closure
 * happens via the accept / force-close / silence-cron paths.
 */
export async function postAdminMessage(
  params: PostAdminMessageParams
): Promise<MutationResult> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: existing, error: fetchError } = await supabase
    .from("grievances")
    .select("id, email, status")
    .eq("id", params.grievanceId)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Grievance not found" };
  }

  if (existing.status === "closed") {
    return {
      success: false,
      message: "Cannot post to a closed grievance",
    };
  }

  // Append the message first. The CHECK constraint enforces author_role/id
  // consistency (see 20260517150000 migration).
  const { error: messageError } = await supabase
    .from("grievance_messages")
    .insert({
      grievance_id: params.grievanceId,
      author_role: "admin",
      author_id: params.adminId,
      body: params.body,
      proposes_close: params.proposesClose,
    });

  if (messageError) {
    logError(messageError as Error, {
      context: "post_admin_message_insert_failed",
      grievanceId: params.grievanceId,
    });
    return { success: false, message: "Failed to post message" };
  }

  // Compute the transition.
  const updateData: Record<string, unknown> = { updated_at: now };

  if (params.proposesClose) {
    // T4a (in_progress) / T4b (open, skip-step) / T4c (awaiting → awaiting).
    updateData.status = "awaiting_user_response";
    updateData.awaiting_since = now;
    updateData.silence_reminder_sent_at = null;
  } else if (existing.status === "open") {
    // T2: open → in_progress.
    updateData.status = "in_progress";
  } else if (existing.status === "awaiting_user_response") {
    // T9: clarification mid-await; status unchanged but silence clock resets.
    updateData.awaiting_since = now;
    updateData.silence_reminder_sent_at = null;
  }
  // T3 (in_progress → in_progress) is a no-op for state fields.

  const { error: updateError } = await supabase
    .from("grievances")
    .update(updateData)
    .eq("id", params.grievanceId);

  if (updateError) {
    logError(updateError as Error, {
      context: "post_admin_message_update_failed",
      grievanceId: params.grievanceId,
    });
    return { success: false, message: "Failed to update grievance state" };
  }

  await logDataAccess({
    tableName: "grievances",
    operation: "UPDATE",
    rowCount: 1,
    userId: params.adminId,
    endpoint: "/api/admin/grievances/[id]/message",
    oldData: { status: existing.status },
    newData: updateData,
    reason: `Admin ${params.proposesClose ? "proposed closing" : "replied to"} grievance ${params.grievanceId}`,
  });

  logSecurityEvent(
    params.proposesClose ? "grievance_closure_proposed" : "grievance_admin_replied",
    {
      grievanceId: params.grievanceId,
      email: existing.email,
      adminId: params.adminId,
      oldStatus: existing.status,
      newStatus: updateData.status ?? existing.status,
    }
  );

  return { success: true, message: "Message posted" };
}

/**
 * Guest posts a dispute response (T6: awaiting_user_response → in_progress).
 *
 * Caller (API endpoint) must have already verified the OTP session matches
 * the grievance's email. This function trusts the caller's identity check
 * and does not re-validate at the row level (consistent with the existing
 * guest API pattern).
 */
export async function postUserDispute(
  params: PostUserDisputeParams
): Promise<MutationResult> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: existing, error: fetchError } = await supabase
    .from("grievances")
    .select("id, email, status")
    .eq("id", params.grievanceId)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Grievance not found" };
  }

  if (existing.status !== "awaiting_user_response") {
    return {
      success: false,
      message: "Can only dispute when admin has replied",
    };
  }

  const { error: messageError } = await supabase
    .from("grievance_messages")
    .insert({
      grievance_id: params.grievanceId,
      author_role: "user",
      author_id: null,
      body: params.body,
      proposes_close: false,
    });

  if (messageError) {
    logError(messageError as Error, {
      context: "post_user_dispute_insert_failed",
      grievanceId: params.grievanceId,
    });
    return { success: false, message: "Failed to post message" };
  }

  const updateData = {
    status: "in_progress",
    awaiting_since: null,
    silence_reminder_sent_at: null,
    updated_at: now,
  };

  const { error: updateError } = await supabase
    .from("grievances")
    .update(updateData)
    .eq("id", params.grievanceId);

  if (updateError) {
    logError(updateError as Error, {
      context: "post_user_dispute_update_failed",
      grievanceId: params.grievanceId,
    });
    return { success: false, message: "Failed to update grievance state" };
  }

  await logDataAccess({
    tableName: "grievances",
    operation: "UPDATE",
    rowCount: 1,
    userId: "system:guest_grievance",
    endpoint: "/api/guest/grievance/[id]/dispute",
    oldData: { status: existing.status },
    newData: updateData,
    reason: `User disputed grievance ${params.grievanceId}`,
  });

  logSecurityEvent("grievance_user_disputed", {
    grievanceId: params.grievanceId,
    email: existing.email,
  });

  return { success: true, message: "Dispute submitted" };
}

/**
 * Guest accepts admin's closure proposal (T5: awaiting_user_response → closed).
 *
 * Silent: no message is inserted. Acceptance is recorded by the status
 * change plus closed_by_role='user'. Letting the user attach a parting
 * comment would risk the thread ending on a toxic or abusive note (see
 * AcceptResolutionParams). If the user wants to say something, they can
 * dispute first, then accept later — that keeps any text in a context
 * where admin can respond.
 */
export async function acceptResolution(
  params: AcceptResolutionParams
): Promise<MutationResult> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: existing, error: fetchError } = await supabase
    .from("grievances")
    .select("id, email, status")
    .eq("id", params.grievanceId)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Grievance not found" };
  }

  if (existing.status !== "awaiting_user_response") {
    return {
      success: false,
      message: "No closure proposal awaiting your acceptance",
    };
  }

  const updateData = {
    status: "closed",
    closed_at: now,
    closed_by_role: "user",
    updated_at: now,
  };

  const { error: updateError } = await supabase
    .from("grievances")
    .update(updateData)
    .eq("id", params.grievanceId);

  if (updateError) {
    logError(updateError as Error, {
      context: "accept_resolution_failed",
      grievanceId: params.grievanceId,
    });
    return { success: false, message: "Failed to close grievance" };
  }

  await logDataAccess({
    tableName: "grievances",
    operation: "UPDATE",
    rowCount: 1,
    userId: "system:guest_grievance",
    endpoint: "/api/guest/grievance/[id]/accept",
    oldData: { status: existing.status },
    newData: updateData,
    reason: `User accepted closure proposal for grievance ${params.grievanceId}`,
  });

  logSecurityEvent("grievance_accepted", {
    grievanceId: params.grievanceId,
    email: existing.email,
  });

  return { success: true, message: "Grievance closed" };
}

/**
 * Admin force-closes a grievance (T8). Reason must be ≥20 characters and
 * is preserved as admin-authored audit copy (not anonymised by the daily
 * cron — see plan §4.3).
 */
export async function forceClose(
  params: ForceCloseParams
): Promise<MutationResult> {
  if (!params.reason || params.reason.trim().length < 20) {
    return {
      success: false,
      message: "Force-close reason must be at least 20 characters",
    };
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: existing, error: fetchError } = await supabase
    .from("grievances")
    .select("id, email, status")
    .eq("id", params.grievanceId)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Grievance not found" };
  }

  if (existing.status === "closed") {
    return { success: false, message: "Grievance is already closed" };
  }

  const updateData = {
    status: "closed",
    closed_at: now,
    closed_by_role: "admin",
    force_close_reason: params.reason.trim(),
    updated_at: now,
  };

  const { error: updateError } = await supabase
    .from("grievances")
    .update(updateData)
    .eq("id", params.grievanceId);

  if (updateError) {
    logError(updateError as Error, {
      context: "force_close_failed",
      grievanceId: params.grievanceId,
    });
    return { success: false, message: "Failed to force-close grievance" };
  }

  await logDataAccess({
    tableName: "grievances",
    operation: "UPDATE",
    rowCount: 1,
    userId: params.adminId,
    endpoint: "/api/admin/grievances/[id]",
    oldData: { status: existing.status },
    newData: updateData,
    reason: `Admin force-closed grievance ${params.grievanceId}`,
  });

  logSecurityEvent("grievance_force_closed", {
    grievanceId: params.grievanceId,
    email: existing.email,
    adminId: params.adminId,
    oldStatus: existing.status,
  });

  return { success: true, message: "Grievance closed" };
}
