/**
 * Auto-Cleanup Service
 * Handles automatic data deletion for DPDP compliance:
 *
 * 1. Abandoned checkouts: Orders with CHECKED_OUT status and no payment after 7 days
 *    - Day 5: Send 48-hour pre-erasure notification
 *    - Day 7: Delete order (order_items cascade via FK)
 *
 * 2. Deferred legal expiry: Deletion requests where 8-year tax retention has expired
 *    - 2 days before expiry: Send 48-hour pre-erasure notification
 *    - On expiry + 48hr: Execute deletion, mark request as completed
 */

import { createServiceClient } from "@/utils/supabase/service";
import { logError, logSecurityEvent } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";
import { sendPreErasureNotification, sendDeletionCompleted } from "@/lib/email";
import { subDays, subHours, addDays } from "date-fns";

// Constants
const ABANDONED_CHECKOUT_NOTIFY_DAYS = 5;
const ABANDONED_CHECKOUT_DELETE_DAYS = 7;
const DEFERRED_EXPIRY_NOTIFY_DAYS = 2;

interface CleanupResult {
  notified: number;
  errors: number;
}

interface DeletionResult {
  deleted: number;
  errors: number;
}

// ─── Abandoned Checkout Cleanup ────────────────────────────────────────────

/**
 * Send 48-hour pre-erasure email for abandoned checkouts (5+ days old, not yet notified)
 */
export async function notifyAbandonedCheckouts(): Promise<CleanupResult> {
  const supabase = createServiceClient();
  const result: CleanupResult = { notified: 0, errors: 0 };

  try {
    const cutoffDate = subDays(new Date(), ABANDONED_CHECKOUT_NOTIFY_DAYS);

    // Find abandoned checkouts that haven't been notified
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, guest_email, created_at")
      .eq("order_status", "CHECKED_OUT")
      .neq("payment_status", "paid")
      .lt("created_at", cutoffDate.toISOString())
      .eq("cleanup_notice_sent", false);

    if (error) {
      logError(error as Error, { context: "auto_cleanup_notify_abandoned_query" });
      return { notified: 0, errors: 1 };
    }

    if (!orders || orders.length === 0) return result;

    // Group by email to send one email per customer
    const byEmail = new Map<string, typeof orders>();
    for (const order of orders) {
      const existing = byEmail.get(order.guest_email) || [];
      existing.push(order);
      byEmail.set(order.guest_email, existing);
    }

    for (const [email, customerOrders] of byEmail) {
      try {
        const deletionDate = addDays(new Date(), DEFERRED_EXPIRY_NOTIFY_DAYS);

        const sent = await sendPreErasureNotification({
          email,
          reason: "abandoned_checkout",
          deletionDate,
          orderCount: customerOrders.length,
        });

        if (sent) {
          const orderIds = customerOrders.map((o) => o.id);
          await supabase
            .from("orders")
            .update({
              cleanup_notice_sent: true,
              cleanup_notice_sent_at: new Date().toISOString(),
            })
            .in("id", orderIds);

          await logDataAccess({
            tableName: "orders",
            operation: "UPDATE",
            queryType: "bulk",
            rowCount: customerOrders.length,
            endpoint: "auto-cleanup",
            reason: `Sent 48hr abandoned checkout notice for ${customerOrders.length} order(s) to ${email}`,
          });

          result.notified += customerOrders.length;
        }
      } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)), {
          context: "auto_cleanup_notify_abandoned_email",
          email,
        });
        result.errors++;
      }
    }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: "auto_cleanup_notify_abandoned_checkouts",
    });
    result.errors++;
  }

  return result;
}

/**
 * Delete abandoned checkouts that are 7+ days old and were notified 48+ hours ago
 */
export async function deleteAbandonedCheckouts(): Promise<DeletionResult> {
  const supabase = createServiceClient();
  const result: DeletionResult = { deleted: 0, errors: 0 };

  try {
    const ageCutoff = subDays(new Date(), ABANDONED_CHECKOUT_DELETE_DAYS);
    const noticeCutoff = subHours(new Date(), 48);

    // Find orders eligible for deletion: old enough + notified 48hr+ ago
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, guest_email")
      .eq("order_status", "CHECKED_OUT")
      .neq("payment_status", "paid")
      .lt("created_at", ageCutoff.toISOString())
      .eq("cleanup_notice_sent", true)
      .lt("cleanup_notice_sent_at", noticeCutoff.toISOString());

    if (error) {
      logError(error as Error, { context: "auto_cleanup_delete_abandoned_query" });
      return { deleted: 0, errors: 1 };
    }

    if (!orders || orders.length === 0) return result;

    const orderIds = orders.map((o) => o.id);

    // Delete orders (order_items cascade via FK ON DELETE CASCADE)
    const { error: deleteError } = await supabase
      .from("orders")
      .delete()
      .in("id", orderIds);

    if (deleteError) {
      logError(deleteError as Error, { context: "auto_cleanup_delete_abandoned_orders" });
      result.errors++;
      return result;
    }

    result.deleted = orderIds.length;

    // Audit log grouped by email
    const emails = [...new Set(orders.map((o) => o.guest_email))];
    for (const email of emails) {
      const count = orders.filter((o) => o.guest_email === email).length;
      await logDataAccess({
        tableName: "orders",
        operation: "DELETE",
        queryType: "bulk",
        rowCount: count,
        endpoint: "auto-cleanup",
        reason: `Auto-deleted ${count} abandoned checkout(s) (7-day cleanup) for ${email}`,
      });
    }

    logSecurityEvent("auto_cleanup_abandoned", {
      deletedCount: result.deleted,
      emailsAffected: emails.length,
    });
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: "auto_cleanup_delete_abandoned_checkouts",
    });
    result.errors++;
  }

  return result;
}

// ─── Deferred Legal Expiry ─────────────────────────────────────────────────

/**
 * Send 48-hour pre-erasure email for deferred deletions nearing retention expiry
 */
export async function notifyDeferredExpiry(): Promise<CleanupResult> {
  const supabase = createServiceClient();
  const result: CleanupResult = { notified: 0, errors: 0 };

  try {
    const notifyCutoff = addDays(new Date(), DEFERRED_EXPIRY_NOTIFY_DAYS);

    // Find deferred requests where retention_end_date is within 2 days and not yet notified
    const { data: requests, error } = await supabase
      .from("deletion_requests")
      .select("id, guest_email, retention_end_date")
      .eq("status", "deferred_legal")
      .eq("deferred_erasure_notified", false)
      .lte("retention_end_date", notifyCutoff.toISOString().split("T")[0]);

    if (error) {
      logError(error as Error, { context: "auto_cleanup_notify_deferred_query" });
      return { notified: 0, errors: 1 };
    }

    if (!requests || requests.length === 0) return result;

    for (const request of requests) {
      try {
        // Count orders that will be deleted
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("guest_email", request.guest_email);

        const sent = await sendPreErasureNotification({
          email: request.guest_email,
          reason: "retention_expired",
          deletionDate: addDays(new Date(), DEFERRED_EXPIRY_NOTIFY_DAYS),
          orderCount: count || 0,
        });

        if (sent) {
          await supabase
            .from("deletion_requests")
            .update({
              deferred_erasure_notified: true,
              deferred_erasure_notified_at: new Date().toISOString(),
            })
            .eq("id", request.id);

          await logDataAccess({
            tableName: "deletion_requests",
            operation: "UPDATE",
            endpoint: "auto-cleanup",
            reason: `Sent 48hr retention expiry notice to ${request.guest_email} (retention_end_date: ${request.retention_end_date})`,
          });

          result.notified++;
        }
      } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)), {
          context: "auto_cleanup_notify_deferred_email",
          requestId: request.id,
        });
        result.errors++;
      }
    }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: "auto_cleanup_notify_deferred_expiry",
    });
    result.errors++;
  }

  return result;
}

/**
 * Execute deletion for deferred requests where retention has expired and 48hr notice was sent
 */
export async function executeDeferredDeletions(): Promise<DeletionResult> {
  const supabase = createServiceClient();
  const result: DeletionResult = { deleted: 0, errors: 0 };

  try {
    const today = new Date().toISOString().split("T")[0];
    const noticeCutoff = subHours(new Date(), 48);

    // Find requests: retention expired + notified 48hr+ ago
    const { data: requests, error } = await supabase
      .from("deletion_requests")
      .select("id, guest_email, retention_end_date")
      .eq("status", "deferred_legal")
      .eq("deferred_erasure_notified", true)
      .lte("retention_end_date", today)
      .lt("deferred_erasure_notified_at", noticeCutoff.toISOString());

    if (error) {
      logError(error as Error, { context: "auto_cleanup_execute_deferred_query" });
      return { deleted: 0, errors: 1 };
    }

    if (!requests || requests.length === 0) return result;

    for (const request of requests) {
      try {
        // Delete all orders for this email (order_items cascade via FK)
        const { data: deletedOrders, error: deleteError } = await supabase
          .from("orders")
          .delete()
          .eq("guest_email", request.guest_email)
          .select("id");

        if (deleteError) {
          logError(deleteError as Error, {
            context: "auto_cleanup_execute_deferred_delete_orders",
            requestId: request.id,
          });
          result.errors++;
          continue;
        }

        const ordersDeleted = deletedOrders?.length || 0;

        // Mark deletion request as completed
        await supabase
          .from("deletion_requests")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", request.id);

        // Send completion email
        try {
          await sendDeletionCompleted({
            email: request.guest_email,
            ordersAnonymized: ordersDeleted,
          });
        } catch {
          // Non-blocking — email failure doesn't undo deletion
        }

        await logDataAccess({
          tableName: "orders",
          operation: "DELETE",
          queryType: "bulk",
          rowCount: ordersDeleted,
          endpoint: "auto-cleanup",
          reason: `Auto-deleted ${ordersDeleted} order(s) after tax retention expiry for ${request.guest_email} (retention_end_date: ${request.retention_end_date})`,
        });

        logSecurityEvent("auto_cleanup_deferred_expiry", {
          requestId: request.id,
          email: request.guest_email,
          ordersDeleted,
          retentionEndDate: request.retention_end_date,
        });

        result.deleted++;
      } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)), {
          context: "auto_cleanup_execute_deferred_single",
          requestId: request.id,
        });
        result.errors++;
      }
    }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: "auto_cleanup_execute_deferred_deletions",
    });
    result.errors++;
  }

  return result;
}
