/**
 * Deletion Request Service
 * Manages the 14-day window period for DPDP-compliant data deletion
 */

import { createServiceClient } from "@/utils/supabase/service";
import { logError, logSecurityEvent } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";
import { addDays, differenceInDays } from "date-fns";

// Constants
export const DELETION_WINDOW_DAYS = parseInt(
  process.env.DELETION_WINDOW_DAYS || "14"
);

// Types
export interface DeletionRequest {
  id: string;
  guest_email: string;
  status: "pending" | "cancelled" | "completed" | "failed";
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

/**
 * Create a new deletion request for a guest
 * Does NOT delete data - creates a pending request with 14-day window
 */
export async function createDeletionRequest(
  params: CreateDeletionRequestParams
): Promise<CreateDeletionRequestResult> {
  const supabase = createServiceClient();
  const normalizedEmail = params.email.toLowerCase().trim();

  // Check if there's already a pending request
  const { data: existing } = await supabase
    .from("deletion_requests")
    .select("id, scheduled_deletion_at")
    .eq("guest_email", normalizedEmail)
    .eq("status", "pending")
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

  // Create the deletion request
  const { data, error } = await supabase
    .from("deletion_requests")
    .insert({
      guest_email: normalizedEmail,
      scheduled_deletion_at: scheduledAt.toISOString(),
      ip_address: params.ip,
      user_agent: params.userAgent || null,
      orders_count: params.ordersCount,
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
    ip: params.ip,
  });

  return {
    requestId: data.id,
    scheduledAt,
    alreadyPending: false,
  };
}

/**
 * Cancel a pending deletion request
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
    .eq("status", "pending")
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No matching row found
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
    .eq("status", "pending")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No matching row found
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
 * Execute deletion for a specific request (anonymize order data)
 * Called by the cron job when the window period expires
 */
export async function executeDeletionRequest(
  requestId: string
): Promise<{ success: boolean; ordersAnonymized: number }> {
  const supabase = createServiceClient();

  // Get the deletion request
  const { data: request, error: fetchError } = await supabase
    .from("deletion_requests")
    .select("*")
    .eq("id", requestId)
    .eq("status", "pending")
    .single();

  if (fetchError || !request) {
    logError(new Error("Deletion request not found or not pending"), {
      context: "execute_deletion_request_not_found",
      requestId,
    });
    return { success: false, ordersAnonymized: 0 };
  }

  const email = request.guest_email;
  const now = new Date();

  // Anonymize order data
  const anonymizedEmail = `deleted-${Date.now()}@anonymized.local`;
  const anonymizedPhone = "0000000000";
  const anonymizedName = "Deleted User";
  const anonymizedAddress = "Address Removed";

  const { data: updatedOrders, error: anonymizeError } = await supabase
    .from("orders")
    .update({
      guest_email: anonymizedEmail,
      guest_phone: anonymizedPhone,
      shipping_first_name: anonymizedName,
      shipping_last_name: "",
      shipping_address_line1: anonymizedAddress,
      shipping_address_line2: null,
      billing_first_name: anonymizedName,
      billing_last_name: "",
      billing_address_line1: anonymizedAddress,
      billing_address_line2: null,
      otp_code: null,
      otp_expires_at: null,
      otp_attempts: 0,
      otp_locked_until: null,
    })
    .eq("guest_email", email)
    .select("id");

  if (anonymizeError) {
    // Mark request as failed
    await supabase
      .from("deletion_requests")
      .update({
        status: "failed",
        updated_at: now.toISOString(),
      })
      .eq("id", requestId);

    logError(anonymizeError as Error, {
      context: "execute_deletion_anonymize_failed",
      requestId,
      email,
    });
    return { success: false, ordersAnonymized: 0 };
  }

  const ordersAnonymized = updatedOrders?.length || 0;

  // Mark request as completed
  await supabase
    .from("deletion_requests")
    .update({
      status: "completed",
      completed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", requestId);

  // Log for audit
  await logDataAccess({
    tableName: "orders",
    operation: "UPDATE",
    queryType: "bulk",
    rowCount: ordersAnonymized,
    endpoint: "/api/cron/process-deletions",
    reason: `DPDP right to erasure - scheduled deletion executed for request ${requestId}`,
  });

  logSecurityEvent("deletion_request_executed", {
    requestId,
    originalEmail: email,
    anonymizedEmail,
    ordersAnonymized,
    completedAt: now.toISOString(),
  });

  return { success: true, ordersAnonymized };
}

/**
 * Get all requests due for execution (window period expired)
 */
export async function getRequestsDueForExecution(): Promise<DeletionRequest[]> {
  const supabase = createServiceClient();
  const now = new Date();

  const { data, error } = await supabase
    .from("deletion_requests")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_deletion_at", now.toISOString())
    .order("scheduled_deletion_at", { ascending: true });

  if (error) {
    logError(error as Error, { context: "get_requests_due_for_execution_failed" });
    return [];
  }

  return (data as DeletionRequest[]) || [];
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

    // Day 1 reminder (sent on day 1, checking if >= 1 day has passed)
    if (daysSinceRequest >= 1 && !request.reminder_day1_sent) {
      result.day1.push(request);
    }

    // Day 7 reminder
    if (daysSinceRequest >= 7 && !request.reminder_day7_sent) {
      result.day7.push(request);
    }

    // Day 13 reminder (1 day before deletion)
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
