/**
 * Deletion Request Service
 * Manages DPDP-compliant data deletion with tax compliance (8-year retention for paid orders)
 *
 * Flow:
 * 1. User requests deletion → 14-day cooling-off window (status: pending)
 * 2. After 14 days → status changes to 'eligible' (cron job)
 * 3. Admin reviews and executes deletion:
 *    - If NO paid orders: delete all data (status: completed)
 *    - If HAS paid orders: clear OTP only, defer deletion 8 years (status: deferred_legal)
 */

import { createServiceClient } from "@/utils/supabase/service";
import { logError, logSecurityEvent } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";
import { addDays, addYears, differenceInDays } from "date-fns";

// Constants
export const DELETION_WINDOW_DAYS = parseInt(
  process.env.DELETION_WINDOW_DAYS || "14"
);
export const TAX_RETENTION_YEARS = 8;

// Types
export type DeletionStatus =
  | "pending"
  | "eligible"
  | "deferred_legal"
  | "cancelled"
  | "completed"
  | "failed";

export interface DeletionRequest {
  id: string;
  guest_email: string;
  status: DeletionStatus;
  requested_at: string;
  scheduled_deletion_at: string;
  cancelled_at: string | null;
  completed_at: string | null;
  cancellation_reason: string | null;
  confirmation_email_sent: boolean;
  reminder_day1_sent: boolean;
  reminder_day7_sent: boolean;
  reminder_day13_sent: boolean;
  completion_email_sent: boolean;
  ip_address: string | null;
  user_agent: string | null;
  orders_count: number;
  // Tax compliance fields
  has_paid_orders: boolean;
  paid_orders_count: number;
  unpaid_orders_count: number;
  earliest_order_fy: string | null;
  retention_end_date: string | null;
  executed_by: string | null;
  otp_cleared: boolean;
  otp_cleared_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDeletionRequestParams {
  email: string;
  ip: string;
  userAgent?: string;
  ordersCount: number;
}

export interface CreateDeletionRequestResult {
  requestId: string;
  scheduledAt: Date;
  alreadyPending?: boolean;
}

export interface ExecuteDeletionResult {
  success: boolean;
  status: DeletionStatus;
  ordersDeleted: number;
  otpCleared: boolean;
  hasPaidOrders: boolean;
  paidOrdersCount: number;
  retentionEndDate: Date | null;
  message: string;
}

/**
 * Calculate financial year from a date
 * Indian FY runs from April 1 to March 31
 * e.g., January 2026 → FY 2025-26
 */
export function getFinancialYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed

  // April (month 3) to March (month 2) of next year
  if (month >= 3) {
    // April onwards: current year to next year
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    // January to March: previous year to current year
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

/**
 * Calculate retention end date (8 years from FY end)
 * e.g., FY 2025-26 ends March 31, 2026 → Retention until March 31, 2034
 */
export function calculateRetentionEndDate(financialYear: string): Date {
  // Parse FY string like "2025-26"
  const startYear = parseInt(financialYear.split("-")[0]);
  const fyEndYear = startYear + 1;

  // FY ends on March 31
  const fyEndDate = new Date(fyEndYear, 2, 31); // March 31 of end year

  // Add 8 years for retention
  return addYears(fyEndDate, TAX_RETENTION_YEARS);
}

/**
 * Create a new deletion request for a guest
 * Does NOT delete data - creates a pending request with 14-day window
 */
export async function createDeletionRequest(
  params: CreateDeletionRequestParams
): Promise<CreateDeletionRequestResult> {
  const supabase = createServiceClient();
  const normalizedEmail = params.email.toLowerCase().trim();

  // Check if there's already an active request (pending, eligible, or deferred_legal)
  const { data: existing } = await supabase
    .from("deletion_requests")
    .select("id, scheduled_deletion_at, status")
    .eq("guest_email", normalizedEmail)
    .in("status", ["pending", "eligible", "deferred_legal"])
    .single();

  if (existing) {
    return {
      requestId: existing.id,
      scheduledAt: new Date(existing.scheduled_deletion_at),
      alreadyPending: true,
    };
  }

  // Calculate scheduled deletion date
  const now = new Date();
  const scheduledAt = addDays(now, DELETION_WINDOW_DAYS);

  // Check for paid orders to pre-populate tax compliance fields
  const { data: orders } = await supabase
    .from("orders")
    .select("id, payment_status, created_at")
    .eq("guest_email", normalizedEmail);

  const paidOrders = orders?.filter((o) => o.payment_status === "paid") || [];
  const unpaidOrders = orders?.filter((o) => o.payment_status !== "paid") || [];
  const hasPaidOrders = paidOrders.length > 0;

  let earliestOrderFy: string | null = null;
  let retentionEndDate: Date | null = null;

  if (hasPaidOrders) {
    // Find earliest paid order date
    const earliestPaidOrder = paidOrders.reduce((earliest, order) => {
      const orderDate = new Date(order.created_at);
      return !earliest || orderDate < earliest ? orderDate : earliest;
    }, null as Date | null);

    if (earliestPaidOrder) {
      earliestOrderFy = getFinancialYear(earliestPaidOrder);
      retentionEndDate = calculateRetentionEndDate(earliestOrderFy);
    }
  }

  // Create the deletion request
  const { data, error } = await supabase
    .from("deletion_requests")
    .insert({
      guest_email: normalizedEmail,
      scheduled_deletion_at: scheduledAt.toISOString(),
      ip_address: params.ip,
      user_agent: params.userAgent || null,
      orders_count: params.ordersCount,
      has_paid_orders: hasPaidOrders,
      paid_orders_count: paidOrders.length,
      unpaid_orders_count: unpaidOrders.length,
      earliest_order_fy: earliestOrderFy,
      retention_end_date: retentionEndDate?.toISOString().split("T")[0] || null,
    })
    .select("id")
    .single();

  if (error) {
    logError(error as Error, {
      context: "create_deletion_request_failed",
      email: normalizedEmail,
    });
    throw new Error("Failed to create deletion request");
  }

  logSecurityEvent("deletion_request_created", {
    requestId: data.id,
    email: normalizedEmail,
    scheduledAt: scheduledAt.toISOString(),
    hasPaidOrders,
    paidOrdersCount: paidOrders.length,
    ip: params.ip,
  });

  return {
    requestId: data.id,
    scheduledAt,
    alreadyPending: false,
  };
}

/**
 * Cancel a pending or eligible deletion request
 */
export async function cancelDeletionRequest(params: {
  email: string;
  reason?: string;
}): Promise<{ success: boolean; cancelledAt: Date | null }> {
  const supabase = createServiceClient();
  const normalizedEmail = params.email.toLowerCase().trim();
  const now = new Date();

  const { data, error } = await supabase
    .from("deletion_requests")
    .update({
      status: "cancelled",
      cancelled_at: now.toISOString(),
      cancellation_reason: params.reason || "User cancelled",
      updated_at: now.toISOString(),
    })
    .eq("guest_email", normalizedEmail)
    .in("status", ["pending", "eligible"])
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { success: false, cancelledAt: null };
    }
    logError(error as Error, {
      context: "cancel_deletion_request_failed",
      email: normalizedEmail,
    });
    throw new Error("Failed to cancel deletion request");
  }

  logSecurityEvent("deletion_request_cancelled", {
    requestId: data.id,
    email: normalizedEmail,
    reason: params.reason,
    cancelledAt: now.toISOString(),
  });

  return { success: true, cancelledAt: now };
}

/**
 * Get pending deletion request for an email
 */
export async function getPendingDeletionRequest(
  email: string
): Promise<DeletionRequest | null> {
  const supabase = createServiceClient();
  const normalizedEmail = email.toLowerCase().trim();

  const { data, error } = await supabase
    .from("deletion_requests")
    .select("*")
    .eq("guest_email", normalizedEmail)
    .in("status", ["pending", "eligible", "deferred_legal"])
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    logError(error as Error, {
      context: "get_pending_deletion_request_failed",
      email: normalizedEmail,
    });
    return null;
  }

  return data as DeletionRequest;
}

/**
 * Get a deletion request by ID
 */
export async function getDeletionRequestById(
  requestId: string
): Promise<DeletionRequest | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("deletion_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    logError(error as Error, {
      context: "get_deletion_request_by_id_failed",
      requestId,
    });
    return null;
  }

  return data as DeletionRequest;
}

/**
 * Mark requests as eligible when 14-day window expires
 * Called by cron job - does NOT execute deletion
 */
export async function markRequestsAsEligible(): Promise<number> {
  const supabase = createServiceClient();
  const now = new Date();

  const { data, error } = await supabase
    .from("deletion_requests")
    .update({
      status: "eligible",
      updated_at: now.toISOString(),
    })
    .eq("status", "pending")
    .lte("scheduled_deletion_at", now.toISOString())
    .select("id");

  if (error) {
    logError(error as Error, { context: "mark_requests_as_eligible_failed" });
    return 0;
  }

  const count = data?.length || 0;

  if (count > 0) {
    logSecurityEvent("deletion_requests_marked_eligible", {
      count,
      timestamp: now.toISOString(),
    });
  }

  return count;
}

/**
 * Execute deletion for a specific request
 * Called by admin - handles tax compliance
 *
 * - If NO paid orders: delete all order data
 * - If HAS paid orders: only clear OTP fields, defer deletion for 8 years
 */
export async function executeDeletionRequest(
  requestId: string,
  adminId?: string
): Promise<ExecuteDeletionResult> {
  const supabase = createServiceClient();

  // Get the deletion request
  const { data: request, error: fetchError } = await supabase
    .from("deletion_requests")
    .select("*")
    .eq("id", requestId)
    .in("status", ["eligible", "pending"]) // Allow both for flexibility
    .single();

  if (fetchError || !request) {
    logError(new Error("Deletion request not found or not eligible"), {
      context: "execute_deletion_request_not_found",
      requestId,
    });
    return {
      success: false,
      status: "failed",
      ordersDeleted: 0,
      otpCleared: false,
      hasPaidOrders: false,
      paidOrdersCount: 0,
      retentionEndDate: null,
      message: "Deletion request not found or not eligible for execution",
    };
  }

  const email = request.guest_email;
  const now = new Date();

  // Re-check for paid orders (data may have changed since request was created)
  const { data: orders } = await supabase
    .from("orders")
    .select("id, payment_status, created_at")
    .eq("guest_email", email);

  const paidOrders = orders?.filter((o) => o.payment_status === "paid") || [];
  const unpaidOrders = orders?.filter((o) => o.payment_status !== "paid") || [];
  const hasPaidOrders = paidOrders.length > 0;

  // Calculate retention end date if there are paid orders
  let earliestOrderFy: string | null = null;
  let retentionEndDate: Date | null = null;

  if (hasPaidOrders) {
    const earliestPaidOrder = paidOrders.reduce((earliest, order) => {
      const orderDate = new Date(order.created_at);
      return !earliest || orderDate < earliest ? orderDate : earliest;
    }, null as Date | null);

    if (earliestPaidOrder) {
      earliestOrderFy = getFinancialYear(earliestPaidOrder);
      retentionEndDate = calculateRetentionEndDate(earliestOrderFy);
    }
  }

  // CASE 1: Has paid orders - cannot delete, only clear OTP and defer
  if (hasPaidOrders) {
    // Clear OTP fields only (not tax-relevant)
    const { error: otpError } = await supabase
      .from("orders")
      .update({
        otp_code: null,
        otp_expires_at: null,
        otp_attempts: 0,
        otp_locked_until: null,
      })
      .eq("guest_email", email);

    if (otpError) {
      logError(otpError as Error, {
        context: "execute_deletion_clear_otp_failed",
        requestId,
        email,
      });
      return {
        success: false,
        status: "failed",
        ordersDeleted: 0,
        otpCleared: false,
        hasPaidOrders: true,
        paidOrdersCount: paidOrders.length,
        retentionEndDate: null,
        message: "Failed to clear OTP data",
      };
    }

    // Delete unpaid orders (no tax obligation)
    let unpaidDeleted = 0;
    if (unpaidOrders.length > 0) {
      const unpaidIds = unpaidOrders.map((o) => o.id);
      const { error: deleteError } = await supabase
        .from("orders")
        .delete()
        .in("id", unpaidIds);

      if (!deleteError) {
        unpaidDeleted = unpaidOrders.length;
      }
    }

    // Mark request as deferred_legal
    await supabase
      .from("deletion_requests")
      .update({
        status: "deferred_legal",
        has_paid_orders: true,
        paid_orders_count: paidOrders.length,
        unpaid_orders_count: 0,
        earliest_order_fy: earliestOrderFy,
        retention_end_date: retentionEndDate?.toISOString().split("T")[0],
        otp_cleared: true,
        otp_cleared_at: now.toISOString(),
        executed_by: adminId || null,
        updated_at: now.toISOString(),
      })
      .eq("id", requestId);

    // Log for audit
    await logDataAccess({
      tableName: "orders",
      operation: "UPDATE",
      queryType: "bulk",
      rowCount: paidOrders.length,
      userId: adminId,
      endpoint: "/api/admin/deletion-requests/execute",
      reason: `DPDP deletion deferred - OTP cleared for ${paidOrders.length} paid orders. Tax retention until ${retentionEndDate?.toISOString().split("T")[0]}`,
    });

    logSecurityEvent("deletion_request_deferred", {
      requestId,
      email,
      paidOrdersCount: paidOrders.length,
      unpaidOrdersDeleted: unpaidDeleted,
      retentionEndDate: retentionEndDate?.toISOString(),
      earliestOrderFy,
      executedBy: adminId,
    });

    return {
      success: true,
      status: "deferred_legal",
      ordersDeleted: unpaidDeleted,
      otpCleared: true,
      hasPaidOrders: true,
      paidOrdersCount: paidOrders.length,
      retentionEndDate,
      message: `Deletion deferred due to tax compliance. ${paidOrders.length} paid order(s) retained until ${retentionEndDate?.toISOString().split("T")[0]}. OTP data cleared. ${unpaidDeleted} unpaid order(s) deleted.`,
    };
  }

  // CASE 2: No paid orders - safe to delete all data
  const { data: deletedOrders, error: deleteError } = await supabase
    .from("orders")
    .delete()
    .eq("guest_email", email)
    .select("id");

  if (deleteError) {
    // Mark request as failed
    await supabase
      .from("deletion_requests")
      .update({
        status: "failed",
        updated_at: now.toISOString(),
      })
      .eq("id", requestId);

    logError(deleteError as Error, {
      context: "execute_deletion_delete_failed",
      requestId,
      email,
    });

    return {
      success: false,
      status: "failed",
      ordersDeleted: 0,
      otpCleared: false,
      hasPaidOrders: false,
      paidOrdersCount: 0,
      retentionEndDate: null,
      message: "Failed to delete order data",
    };
  }

  const ordersDeleted = deletedOrders?.length || 0;

  // Mark request as completed
  await supabase
    .from("deletion_requests")
    .update({
      status: "completed",
      completed_at: now.toISOString(),
      has_paid_orders: false,
      paid_orders_count: 0,
      executed_by: adminId || null,
      updated_at: now.toISOString(),
    })
    .eq("id", requestId);

  // Log for audit
  await logDataAccess({
    tableName: "orders",
    operation: "DELETE",
    queryType: "bulk",
    rowCount: ordersDeleted,
    userId: adminId,
    endpoint: "/api/admin/deletion-requests/execute",
    reason: `DPDP right to erasure - ${ordersDeleted} orders deleted for request ${requestId}`,
  });

  logSecurityEvent("deletion_request_completed", {
    requestId,
    email,
    ordersDeleted,
    executedBy: adminId,
    completedAt: now.toISOString(),
  });

  return {
    success: true,
    status: "completed",
    ordersDeleted,
    otpCleared: false,
    hasPaidOrders: false,
    paidOrdersCount: 0,
    retentionEndDate: null,
    message: `Deletion completed. ${ordersDeleted} order(s) permanently deleted.`,
  };
}

/**
 * Get all requests with 'eligible' status (ready for admin execution)
 */
export async function getEligibleDeletionRequests(): Promise<DeletionRequest[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("deletion_requests")
    .select("*")
    .eq("status", "eligible")
    .order("scheduled_deletion_at", { ascending: true });

  if (error) {
    logError(error as Error, { context: "get_eligible_deletion_requests_failed" });
    return [];
  }

  return (data as DeletionRequest[]) || [];
}

/**
 * Get all deletion requests with optional filters
 */
export async function getDeletionRequests(params?: {
  status?: DeletionStatus | DeletionStatus[];
  email?: string;
  limit?: number;
  offset?: number;
}): Promise<{ requests: DeletionRequest[]; total: number }> {
  const supabase = createServiceClient();

  let query = supabase.from("deletion_requests").select("*", { count: "exact" });

  if (params?.status) {
    if (Array.isArray(params.status)) {
      query = query.in("status", params.status);
    } else {
      query = query.eq("status", params.status);
    }
  }

  if (params?.email) {
    query = query.ilike("guest_email", `%${params.email}%`);
  }

  query = query.order("created_at", { ascending: false });

  if (params?.limit) {
    query = query.limit(params.limit);
  }

  if (params?.offset) {
    query = query.range(params.offset, params.offset + (params?.limit || 10) - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    logError(error as Error, { context: "get_deletion_requests_failed" });
    return { requests: [], total: 0 };
  }

  return {
    requests: (data as DeletionRequest[]) || [],
    total: count || 0,
  };
}

/**
 * Get requests needing reminder emails
 * Returns requests grouped by reminder type (day 1, 7, 13)
 */
export async function getRequestsNeedingReminders(): Promise<{
  day1: DeletionRequest[];
  day7: DeletionRequest[];
  day13: DeletionRequest[];
}> {
  const supabase = createServiceClient();
  const now = new Date();

  const { data, error } = await supabase
    .from("deletion_requests")
    .select("*")
    .eq("status", "pending")
    .gt("scheduled_deletion_at", now.toISOString());

  if (error) {
    logError(error as Error, { context: "get_requests_needing_reminders_failed" });
    return { day1: [], day7: [], day13: [] };
  }

  const requests = (data as DeletionRequest[]) || [];
  const result = {
    day1: [] as DeletionRequest[],
    day7: [] as DeletionRequest[],
    day13: [] as DeletionRequest[],
  };

  for (const request of requests) {
    const requestedAt = new Date(request.requested_at);
    const daysSinceRequest = differenceInDays(now, requestedAt);

    if (daysSinceRequest >= 1 && !request.reminder_day1_sent) {
      result.day1.push(request);
    }

    if (daysSinceRequest >= 7 && !request.reminder_day7_sent) {
      result.day7.push(request);
    }

    if (daysSinceRequest >= 13 && !request.reminder_day13_sent) {
      result.day13.push(request);
    }
  }

  return result;
}

/**
 * Mark a reminder as sent
 */
export async function markReminderSent(
  requestId: string,
  reminderType: "day1" | "day7" | "day13" | "completion" | "confirmation"
): Promise<void> {
  const supabase = createServiceClient();

  const columnMap: Record<string, string> = {
    confirmation: "confirmation_email_sent",
    day1: "reminder_day1_sent",
    day7: "reminder_day7_sent",
    day13: "reminder_day13_sent",
    completion: "completion_email_sent",
  };

  const column = columnMap[reminderType];
  if (!column) return;

  const { error } = await supabase
    .from("deletion_requests")
    .update({
      [column]: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) {
    logError(error as Error, {
      context: "mark_reminder_sent_failed",
      requestId,
      reminderType,
    });
  }
}

/**
 * Calculate days remaining until deletion
 */
export function getDaysRemaining(scheduledDeletionAt: string | Date): number {
  const scheduled = new Date(scheduledDeletionAt);
  const now = new Date();
  const days = differenceInDays(scheduled, now);
  return Math.max(0, days);
}

/**
 * Get summary statistics for deletion requests
 */
export async function getDeletionRequestStats(): Promise<{
  pending: number;
  eligible: number;
  deferredLegal: number;
  completed: number;
  failed: number;
  eligibleNext7Days: number;
}> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("deletion_requests")
    .select("status, scheduled_deletion_at");

  if (error) {
    logError(error as Error, { context: "get_deletion_request_stats_failed" });
    return {
      pending: 0,
      eligible: 0,
      deferredLegal: 0,
      completed: 0,
      failed: 0,
      eligibleNext7Days: 0,
    };
  }

  const now = new Date();
  const in7Days = addDays(now, 7);

  const stats = {
    pending: 0,
    eligible: 0,
    deferredLegal: 0,
    completed: 0,
    failed: 0,
    eligibleNext7Days: 0,
  };

  for (const req of data || []) {
    switch (req.status) {
      case "pending":
        stats.pending++;
        // Check if becoming eligible in next 7 days
        const scheduledAt = new Date(req.scheduled_deletion_at);
        if (scheduledAt <= in7Days) {
          stats.eligibleNext7Days++;
        }
        break;
      case "eligible":
        stats.eligible++;
        break;
      case "deferred_legal":
        stats.deferredLegal++;
        break;
      case "completed":
        stats.completed++;
        break;
      case "failed":
        stats.failed++;
        break;
    }
  }

  return stats;
}
