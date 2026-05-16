/**
 * Deletion Request Service
 * Manages DPDP-compliant data deletion with tax compliance (8-year retention for paid orders)
 *
 * Flow:
 * 1. User requests deletion → 14-day cooling-off window (status: pending)
 * 2. After 14 days → daily cron auto-executes each pending request:
 *    - If NO paid orders: delete all data (status: completed)
 *    - If HAS paid orders: anonymize PII (per CGST Rule 46 threshold) and defer
 *      hard delete for 8 years (status: deferred_legal)
 * 3. If execution fails, request stays at pending and the next cron run retries.
 */

import { createServiceClient } from "@/utils/supabase/service";
import { logError, logSecurityEvent } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";
import {
  sendDeletionCompleted,
  sendDeletionDeferred,
  sendNomineeDeletionCompleted,
  sendNomineeDeletionDeferred,
} from "@/lib/email";
import { addDays, addYears, differenceInDays } from "date-fns";

// Constants
export const DELETION_WINDOW_DAYS = parseInt(
  process.env.DELETION_WINDOW_DAYS || "14"
);
export const TAX_RETENTION_YEARS = 8;

// Types
export type DeletionStatus =
  | "pending"
  | "deferred_legal"
  | "cancelled"
  | "completed";

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
  deferred_erasure_notified: boolean;
  deferred_erasure_notified_at: string | null;
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
 * Outcome of a single executeDeletionRequest call.
 * Distinct from DeletionStatus (DB column) — this carries runtime signaling,
 * including "failed" sentinels that never get written to the row.
 */
export type ExecutionOutcome =
  | "completed"        // request transitioned to completed in DB
  | "deferred_legal"   // request transitioned to deferred_legal in DB
  | "pending"          // execution attempted; row stays pending for next-cycle retry
  | "failed";          // request not found / not eligible — no row mutation

export interface ExecuteDeletionResult {
  success: boolean;
  status: ExecutionOutcome;
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

  // Check if there's already an active request (pending or deferred_legal)
  const { data: existing } = await supabase
    .from("deletion_requests")
    .select("id, scheduled_deletion_at, status")
    .eq("guest_email", normalizedEmail)
    .in("status", ["pending", "deferred_legal"])
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
 * Cancel a pending deletion request (only during the 14-day cooling-off window)
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
    .in("status", ["pending", "deferred_legal"])
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

export interface AutoExecuteResult {
  attempted: number;
  completed: number;
  deferred: number;
  retryable: number;
  errors: number;
  completionEmailsSent: number;
  completionEmailsFailed: number;
  deferredEmailsSent: number;
  deferredEmailsFailed: number;
}

/**
 * Auto-execute pending deletion requests whose 14-day cooling-off window has expired.
 * Called by the daily cron — no admin intervention required.
 *
 * For each due request, calls executeDeletionRequest:
 *   - 'completed'      → request closed, all data erased, completion email sent
 *   - 'deferred_legal' → PII anonymized, 8-year retention applies
 *   - 'pending'        → execution failed, row left for next-cycle retry
 *   - 'failed'         → request not found / disappeared mid-batch
 */
export async function autoExecutePendingDeletions(): Promise<AutoExecuteResult> {
  const supabase = createServiceClient();
  const now = new Date();

  const { data: dueRequests, error } = await supabase
    .from("deletion_requests")
    .select("id, guest_email, source_nominee_claim_id")
    .eq("status", "pending")
    .lte("scheduled_deletion_at", now.toISOString())
    .order("scheduled_deletion_at", { ascending: true });

  if (error) {
    logError(error as Error, { context: "auto_execute_query_failed" });
    return {
      attempted: 0,
      completed: 0,
      deferred: 0,
      retryable: 0,
      errors: 1,
      completionEmailsSent: 0,
      completionEmailsFailed: 0,
      deferredEmailsSent: 0,
      deferredEmailsFailed: 0,
    };
  }

  const result: AutoExecuteResult = {
    attempted: 0,
    completed: 0,
    deferred: 0,
    retryable: 0,
    errors: 0,
    completionEmailsSent: 0,
    completionEmailsFailed: 0,
    deferredEmailsSent: 0,
    deferredEmailsFailed: 0,
  };

  for (const req of dueRequests || []) {
    result.attempted++;
    try {
      const execResult = await executeDeletionRequest(req.id);

      // For nominee-originated rows the principal mailbox is unattended
      // (deceased/incapacitated). Look up the nominee to redirect mail.
      let nomineeInfo: { email: string; name: string; claimId: string } | null = null;
      if (req.source_nominee_claim_id) {
        const { data: claim } = await supabase
          .from("nominee_claims")
          .select("id, nominee_email, nominee:nominees(nominee_name)")
          .eq("id", req.source_nominee_claim_id)
          .single();
        if (claim) {
          // supabase-js types the join as either a single object or an
          // array depending on relationship cardinality; normalise.
          const joined = (claim as { nominee?: { nominee_name?: string } | { nominee_name?: string }[] }).nominee;
          const nomineeName = Array.isArray(joined)
            ? joined[0]?.nominee_name ?? "Nominee"
            : joined?.nominee_name ?? "Nominee";
          nomineeInfo = {
            email: (claim as { nominee_email: string }).nominee_email,
            name: nomineeName,
            claimId: req.source_nominee_claim_id,
          };
        }
      }

      switch (execResult.status) {
        case "completed":
          result.completed++;
          try {
            if (nomineeInfo) {
              await sendNomineeDeletionCompleted({
                nomineeEmail: nomineeInfo.email,
                nomineeName: nomineeInfo.name,
                principalEmail: req.guest_email,
                claimId: nomineeInfo.claimId,
                ordersAnonymized: execResult.ordersDeleted,
              });
            } else {
              await sendDeletionCompleted({
                email: req.guest_email,
                ordersAnonymized: execResult.ordersDeleted,
              });
            }
            result.completionEmailsSent++;
          } catch (emailErr) {
            result.completionEmailsFailed++;
            logError(emailErr as Error, {
              context: "auto_execute_completion_email_failed",
              requestId: req.id,
            });
          }
          break;
        case "deferred_legal":
          result.deferred++;
          try {
            if (nomineeInfo) {
              await sendNomineeDeletionDeferred({
                nomineeEmail: nomineeInfo.email,
                nomineeName: nomineeInfo.name,
                principalEmail: req.guest_email,
                claimId: nomineeInfo.claimId,
                ordersAnonymized: execResult.ordersDeleted,
                retentionEndDate: execResult.retentionEndDate,
              });
            } else {
              await sendDeletionDeferred({
                email: req.guest_email,
                ordersAnonymized: execResult.ordersDeleted,
                retentionEndDate: execResult.retentionEndDate,
              });
            }
            result.deferredEmailsSent++;
          } catch (emailErr) {
            result.deferredEmailsFailed++;
            logError(emailErr as Error, {
              context: "auto_execute_deferred_email_failed",
              requestId: req.id,
            });
          }
          break;
        case "pending":
          result.retryable++;
          break;
        case "failed":
          result.errors++;
          break;
      }
    } catch (err) {
      result.errors++;
      logError(err as Error, {
        context: "auto_execute_single_failed",
        requestId: req.id,
      });
    }
  }

  if (result.attempted > 0) {
    logSecurityEvent("deletion_requests_auto_executed", {
      ...result,
      timestamp: now.toISOString(),
    });
  }

  return result;
}

/**
 * Execute deletion for a specific request. Called by the daily cron
 * (autoExecutePendingDeletions) for pending requests past their 14-day window.
 *
 * - If NO paid orders: delete all order data (status: completed)
 * - If HAS paid orders: anonymize PII per CGST Rule 46 threshold,
 *   defer hard delete for 8 years (status: deferred_legal)
 * - On CASE 2 delete failure: row stays at 'pending', retried next cycle
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
    .eq("status", "pending")
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
    .select("id, payment_status, created_at, total_amount")
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

  // CASE 1: Has paid orders - cannot delete, only anonymize PII and defer
  if (hasPaidOrders) {
    const RECIPIENT_DETAILS_THRESHOLD = 50000;
    const allPaidOrderIds = paidOrders.map((o) => o.id);
    const lowValueOrderIds = paidOrders
      .filter((o) => Number(o.total_amount) < RECIPIENT_DETAILS_THRESHOLD)
      .map((o) => o.id);
    const highValueOrderIds = paidOrders
      .filter((o) => Number(o.total_amount) >= RECIPIENT_DETAILS_THRESHOLD)
      .map((o) => o.id);

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

    const anonymizedEmail = `deleted-${requestId}@anonymized.local`;
    const { error: emailPhoneError } = await supabase
      .from("orders")
      .update({
        guest_email: anonymizedEmail,
        guest_phone: "0000000000",
      })
      .in("id", allPaidOrderIds);

    if (emailPhoneError) {
      logError(emailPhoneError as Error, {
        context: "execute_deletion_anonymize_email_phone_failed",
        requestId,
        email,
      });
      return {
        success: false,
        status: "failed",
        ordersDeleted: 0,
        otpCleared: true,
        hasPaidOrders: true,
        paidOrdersCount: paidOrders.length,
        retentionEndDate: null,
        message: "Failed to anonymize order email/phone",
      };
    }

    if (lowValueOrderIds.length > 0) {
      const { error: anonymizeAddressError } = await supabase
        .from("orders")
        .update({
          shipping_first_name: "Deleted",
          shipping_last_name: "User",
          shipping_address_line1: "Address Removed",
          shipping_address_line2: null,
          billing_first_name: "Deleted",
          billing_last_name: "User",
          billing_address_line1: "Address Removed",
          billing_address_line2: null,
        })
        .in("id", lowValueOrderIds);

      if (anonymizeAddressError) {
        logError(anonymizeAddressError as Error, {
          context: "execute_deletion_anonymize_address_failed",
          requestId,
          email,
        });
        return {
          success: false,
          status: "failed",
          ordersDeleted: 0,
          otpCleared: true,
          hasPaidOrders: true,
          paidOrdersCount: paidOrders.length,
          retentionEndDate: null,
          message: "Failed to anonymize order address PII",
        };
      }
    }

    // Anonymize review data (DPDP compliance)
    // 1. Scrub guest_email from review_tokens for this user
    const { error: tokenAnonymizeError } = await supabase
      .from("review_tokens")
      .update({ guest_email: "[deleted]" })
      .eq("guest_email", email);

    if (tokenAnonymizeError) {
      logError(tokenAnonymizeError as Error, {
        context: "execute_deletion_anonymize_review_tokens_failed",
        requestId,
        email,
      });
    }

    // 2. Nullify review_text for reviews linked to paid orders (text may contain PII)
    const paidOrderIds = paidOrders.map((o) => o.id);
    const { error: reviewAnonymizeError } = await supabase
      .from("reviews")
      .update({ review_text: null })
      .in("order_id", paidOrderIds);

    if (reviewAnonymizeError) {
      logError(reviewAnonymizeError as Error, {
        context: "execute_deletion_anonymize_reviews_failed",
        requestId,
        email,
      });
    }

    // Delete unpaid orders (no tax obligation)
    // CASCADE will also delete their review_tokens and reviews
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
      reason: `DPDP deletion deferred - OTP cleared, email and phone anonymized on ${allPaidOrderIds.length} paid order(s), names and address lines anonymized on ${lowValueOrderIds.length} order(s) below ₹50,000, ${highValueOrderIds.length} order(s) at or above ₹50,000 retained full recipient PII, review data anonymized. Tax retention until ${retentionEndDate?.toISOString().split("T")[0]}`,
    });

    logSecurityEvent("deletion_request_deferred", {
      requestId,
      email,
      paidOrdersCount: paidOrders.length,
      ordersFullyAnonymized: lowValueOrderIds.length,
      ordersEmailPhoneOnlyAnonymized: highValueOrderIds.length,
      unpaidOrdersDeleted: unpaidDeleted,
      reviewTokensAnonymized: !tokenAnonymizeError,
      reviewTextsAnonymized: !reviewAnonymizeError,
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
      message: `Deletion deferred due to tax compliance. ${paidOrders.length} paid order(s) retained until ${retentionEndDate?.toISOString().split("T")[0]}. OTP, email and phone anonymized; ${lowValueOrderIds.length} order(s) below ₹50,000 had names and address lines anonymized; ${highValueOrderIds.length} order(s) at or above ₹50,000 retain full recipient details. Review data anonymized. ${unpaidDeleted} unpaid order(s) deleted.`,
    };
  }

  // CASE 2: No paid orders - safe to delete all data
  const { data: deletedOrders, error: deleteError } = await supabase
    .from("orders")
    .delete()
    .eq("guest_email", email)
    .select("id");

  if (deleteError) {
    logError(deleteError as Error, {
      context: "execute_deletion_delete_failed",
      requestId,
      email,
    });

    return {
      success: false,
      status: "pending",
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
  deferredLegal: number;
  completed: number;
  cancelled: number;
  dueNext7Days: number;
}> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("deletion_requests")
    .select("status, scheduled_deletion_at");

  if (error) {
    logError(error as Error, { context: "get_deletion_request_stats_failed" });
    return {
      pending: 0,
      deferredLegal: 0,
      completed: 0,
      cancelled: 0,
      dueNext7Days: 0,
    };
  }

  const now = new Date();
  const in7Days = addDays(now, 7);

  const stats = {
    pending: 0,
    deferredLegal: 0,
    completed: 0,
    cancelled: 0,
    dueNext7Days: 0,
  };

  for (const req of data || []) {
    switch (req.status) {
      case "pending":
        stats.pending++;
        const scheduledAt = new Date(req.scheduled_deletion_at);
        if (scheduledAt <= in7Days) {
          stats.dueNext7Days++;
        }
        break;
      case "deferred_legal":
        stats.deferredLegal++;
        break;
      case "completed":
        stats.completed++;
        break;
      case "cancelled":
        stats.cancelled++;
        break;
    }
  }

  return stats;
}
