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
import {
  sendPreErasureNotification,
  sendDeletionCompleted,
  sendCartRecoveryEmail,
  sendGrievanceSilenceReminder,
  sendGrievanceAutoClosed,
} from "@/lib/email";
import { subDays, subHours, addDays } from "date-fns";
import { generateResumeToken, buildResumeUrl } from "@/lib/resume-token";
import { scrubRazorpayNotes } from "@/lib/razorpay-server";

// Constants
const ABANDONED_CHECKOUT_RECOVERY_DAYS = 1;
const ABANDONED_CHECKOUT_NOTIFY_DAYS = 5;
const ABANDONED_CHECKOUT_DELETE_DAYS = 7;
const ABANDONED_CHECKOUT_DELETE_CUSHION_HOURS = 48;
const DEFERRED_EXPIRY_NOTIFY_DAYS = 2;

function getAbandonedRecoveryDays(): number {
  if (process.env.NODE_ENV !== "production" && process.env.ABANDONED_RECOVERY_DAYS_OVERRIDE) {
    return Number(process.env.ABANDONED_RECOVERY_DAYS_OVERRIDE);
  }
  return ABANDONED_CHECKOUT_RECOVERY_DAYS;
}

function getAbandonedNotifyDays(): number {
  if (process.env.NODE_ENV !== "production" && process.env.ABANDONED_NOTIFY_DAYS_OVERRIDE) {
    return Number(process.env.ABANDONED_NOTIFY_DAYS_OVERRIDE);
  }
  return ABANDONED_CHECKOUT_NOTIFY_DAYS;
}

function getAbandonedDeleteDays(): number {
  if (process.env.NODE_ENV !== "production" && process.env.ABANDONED_DELETE_DAYS_OVERRIDE) {
    return Number(process.env.ABANDONED_DELETE_DAYS_OVERRIDE);
  }
  return ABANDONED_CHECKOUT_DELETE_DAYS;
}

function getAbandonedDeleteCushionHours(): number {
  if (process.env.NODE_ENV !== "production" && process.env.ABANDONED_DELETE_CUSHION_HOURS_OVERRIDE) {
    return Number(process.env.ABANDONED_DELETE_CUSHION_HOURS_OVERRIDE);
  }
  return ABANDONED_CHECKOUT_DELETE_CUSHION_HOURS;
}

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
 * Day-1 cart recovery email with a resume link.
 * Issues a single resume token per order; the same token is later reused by
 * the day-5 DPDP notice if the cart still hasn't been paid.
 */
export async function sendAbandonedCartRecovery(): Promise<CleanupResult> {
  const supabase = createServiceClient();
  const result: CleanupResult = { notified: 0, errors: 0 };

  try {
    const cutoffDate = subDays(new Date(), getAbandonedRecoveryDays());

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, guest_email, total_amount")
      .eq("order_status", "CHECKED_OUT")
      .eq("payment_status", "initiated")
      .lt("created_at", cutoffDate.toISOString())
      .is("resume_email_sent_at", null);

    if (error) {
      logError(error as Error, { context: "auto_cleanup_recovery_query" });
      return { notified: 0, errors: 1 };
    }

    if (!orders || orders.length === 0) return result;

    for (const order of orders) {
      try {
        const { data: items } = await supabase
          .from("order_items")
          .select("product_name, quantity, unit_price")
          .eq("order_id", order.id);

        const { rawToken, hash, expiresAt } = generateResumeToken();

        const { error: tokenError } = await supabase
          .from("orders")
          .update({
            resume_token_hash: hash,
            resume_token_expires_at: expiresAt.toISOString(),
            resume_email_sent_at: new Date().toISOString(),
          })
          .eq("id", order.id);

        if (tokenError) {
          logError(tokenError as Error, {
            context: "auto_cleanup_recovery_token_update",
            orderId: order.id,
          });
          result.errors++;
          continue;
        }

        const sent = await sendCartRecoveryEmail({
          email: order.guest_email,
          resumeUrl: buildResumeUrl(rawToken),
          items: items || [],
          total: order.total_amount,
        });

        if (sent) {
          await logDataAccess({
            tableName: "orders",
            operation: "UPDATE",
            queryType: "single",
            rowCount: 1,
            endpoint: "auto-cleanup",
            reason: `Sent day-1 cart recovery email to ${order.guest_email}`,
          });
          result.notified++;
        }
      } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)), {
          context: "auto_cleanup_recovery_per_order",
          orderId: order.id,
        });
        result.errors++;
      }
    }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: "auto_cleanup_recovery",
    });
    result.errors++;
  }

  return result;
}

/**
 * Send 48-hour pre-erasure email for abandoned checkouts (5+ days old, not yet notified)
 */
export async function notifyAbandonedCheckouts(): Promise<CleanupResult> {
  const supabase = createServiceClient();
  const result: CleanupResult = { notified: 0, errors: 0 };

  try {
    const cutoffDate = subDays(new Date(), getAbandonedNotifyDays());

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
    const ageCutoff = subDays(new Date(), getAbandonedDeleteDays());
    const noticeCutoff = subHours(new Date(), getAbandonedDeleteCushionHours());

    // Find orders eligible for deletion: old enough + notified 48hr+ ago
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, guest_email, razorpay_order_id")
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

    await Promise.all(orders.map((o) => scrubRazorpayNotes(o.razorpay_order_id)));

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


// ---- delete paid orders after retention period for tax purpose is over
// --- retention period is defined by 31st december of the financialy year of the transaction date
// determined by paid_at which is before 31st march of the year or after  and 72 months 


export async function deletePaidOrders(): Promise<CleanupResult> {

  const supabase = createServiceClient();

  const now = new Date();

  const { data: deleted, error } = await supabase.from("orders")
    .delete().not("retention_end_date", "is", null).lte("retention_end_date", now.toISOString()).select("id");

  if (error) {
    logError(error as Error, { context: "auto_cleanup_delete_paid_orders" });
    return { notified: 0, errors: 1 }
  }

  if (deleted) {
    return { notified: deleted.length, errors: 0 };
  }
  return { notified: 0, errors: 0 };
}


// ─── Stale Grievances ───────────────────────────────────────────────────────

const TERMINAL_REQUEST_ANONYMISE_DAYS = 90;

/**
 * Anonymise closed grievances whose `closed_at` is older than the 90-day
 * window. The audit residue (category, status, priority, sla_deadline,
 * closed_at, closed_by_role, force_close_reason) is preserved; the
 * principal-authored PII (email, subject, description, ip_address,
 * user_agent on the parent row, plus user-authored message bodies in the
 * thread) is nulled. 90 days matches the DPDP Rule 14(3) appeal window.
 *
 * Two passes per cycle:
 *   1. UPDATE grievances → null PII columns on terminal rows past cutoff.
 *   2. UPDATE grievance_messages → null user-authored bodies for those
 *      grievances. Admin-authored messages stay intact (operational
 *      audit) — see plan §4.3.
 */
export async function anonymiseStaleGrievances(): Promise<CleanupResult> {
  const supabase = createServiceClient();
  const result: CleanupResult = { notified: 0, errors: 0 };

  try {
    const cutoff = subDays(new Date(), TERMINAL_REQUEST_ANONYMISE_DAYS);
    const now = new Date().toISOString();

    const { data: anonymised, error } = await supabase
      .from("grievances")
      .update({
        email: null,
        subject: null,
        description: null,
        ip_address: null,
        user_agent: null,
        anonymised_at: now,
        updated_at: now,
      })
      .eq("status", "closed")
      .is("anonymised_at", null)
      .lt("closed_at", cutoff.toISOString())
      .select("id");

    if (error) {
      logError(error as Error, {
        context: "auto_cleanup_anonymise_grievances",
      });
      result.errors++;
      return result;
    }

    const anonymisedIds = (anonymised || []).map((r) => r.id as string);
    result.notified = anonymisedIds.length;

    // Pass 2 — scrub user-authored message bodies for the same grievances.
    // The `author_role='user'` filter (backed by the consistency CHECK
    // constraint in 20260517150000) ensures admin bodies are not touched.
    if (anonymisedIds.length > 0) {
      const { data: scrubbed, error: messageError } = await supabase
        .from("grievance_messages")
        .update({ body: null, anonymised_at: now })
        .in("grievance_id", anonymisedIds)
        .eq("author_role", "user")
        .is("anonymised_at", null)
        .select("id");

      if (messageError) {
        logError(messageError as Error, {
          context: "auto_cleanup_anonymise_grievance_messages",
        });
        result.errors++;
      } else if ((scrubbed?.length || 0) > 0) {
        await logDataAccess({
          tableName: "grievance_messages",
          operation: "UPDATE",
          queryType: "bulk",
          rowCount: scrubbed!.length,
          endpoint: "auto-cleanup",
          reason: `Anonymised ${scrubbed!.length} user-authored message body(ies) on anonymised grievances`,
        });
      }
    }

    if (result.notified > 0) {
      await logDataAccess({
        tableName: "grievances",
        operation: "UPDATE",
        queryType: "bulk",
        rowCount: result.notified,
        endpoint: "auto-cleanup",
        reason: `Anonymised ${result.notified} closed grievance row(s) past ${TERMINAL_REQUEST_ANONYMISE_DAYS}-day window (DPDP §4 / §8(7))`,
      });

      logSecurityEvent("auto_cleanup_grievances", {
        anonymisedCount: result.notified,
      });
    }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: "auto_cleanup_anonymise_grievances",
    });
    result.errors++;
  }

  return result;
}

// ─── Grievance acceptance-workflow silence crons ──────────────────────────
// Two crons, both keyed off awaiting_since (which is reset on every admin
// communication while awaiting_user_response — see plan §1 T4c/T9).

const SILENCE_REMINDER_DAYS = 14;
const SILENCE_AUTO_CLOSE_DAYS = 30;

/**
 * Day-14 silence reminder: for grievances in awaiting_user_response whose
 * last admin touch was 14+ days ago AND whose user has not yet been
 * reminded. Sends one reminder email and stamps silence_reminder_sent_at
 * so the next reminder fires only on a fresh admin touch (T4c/T9 reset
 * this column to NULL — see plan §1 transition table).
 */
export async function remindGrievanceSilence(): Promise<CleanupResult> {
  const supabase = createServiceClient();
  const result: CleanupResult = { notified: 0, errors: 0 };

  try {
    const cutoff = subDays(new Date(), SILENCE_REMINDER_DAYS);

    const { data: candidates, error } = await supabase
      .from("grievances")
      .select("id, email, subject, awaiting_since")
      .eq("status", "awaiting_user_response")
      .is("silence_reminder_sent_at", null)
      .lt("awaiting_since", cutoff.toISOString());

    if (error) {
      logError(error as Error, {
        context: "auto_cleanup_grievance_silence_query",
      });
      return { notified: 0, errors: 1 };
    }

    if (!candidates || candidates.length === 0) return result;

    for (const g of candidates) {
      try {
        const daysUntilAutoClose = Math.max(
          1,
          SILENCE_AUTO_CLOSE_DAYS - SILENCE_REMINDER_DAYS
        );
        const sent = await sendGrievanceSilenceReminder({
          email: g.email,
          grievanceId: g.id,
          subject: g.subject,
          daysUntilAutoClose,
        });

        if (sent) {
          const { error: updateError } = await supabase
            .from("grievances")
            .update({
              silence_reminder_sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", g.id);

          if (updateError) {
            logError(updateError as Error, {
              context: "auto_cleanup_grievance_silence_mark_sent",
              grievanceId: g.id,
            });
            result.errors++;
            continue;
          }

          await logDataAccess({
            tableName: "grievances",
            operation: "UPDATE",
            rowCount: 1,
            endpoint: "auto-cleanup",
            reason: `Sent day-${SILENCE_REMINDER_DAYS} silence reminder for grievance ${g.id}`,
          });
          result.notified++;
        }
      } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)), {
          context: "auto_cleanup_grievance_silence_per_row",
          grievanceId: g.id,
        });
        result.errors++;
      }
    }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: "auto_cleanup_grievance_silence",
    });
    result.errors++;
  }

  return result;
}

/**
 * Day-30 auto-close: for grievances in awaiting_user_response whose last
 * admin touch was 30+ days ago, transition to closed with
 * closed_by_role='auto_silence'. Emails both user and grievance officer.
 */
export async function autoCloseSilentGrievances(): Promise<DeletionResult> {
  const supabase = createServiceClient();
  const result: DeletionResult = { deleted: 0, errors: 0 };

  try {
    const cutoff = subDays(new Date(), SILENCE_AUTO_CLOSE_DAYS);

    const { data: candidates, error } = await supabase
      .from("grievances")
      .select("id, email, subject")
      .eq("status", "awaiting_user_response")
      .lt("awaiting_since", cutoff.toISOString());

    if (error) {
      logError(error as Error, {
        context: "auto_cleanup_grievance_auto_close_query",
      });
      return { deleted: 0, errors: 1 };
    }

    if (!candidates || candidates.length === 0) return result;

    for (const g of candidates) {
      try {
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from("grievances")
          .update({
            status: "closed",
            closed_at: now,
            closed_by_role: "auto_silence",
            updated_at: now,
          })
          .eq("id", g.id)
          // Guard against a race: if admin posted between the SELECT and
          // this UPDATE, awaiting_since may have been reset within the
          // grace window. Only flip rows still actually 30+ days silent.
          .eq("status", "awaiting_user_response")
          .lt("awaiting_since", cutoff.toISOString());

        if (updateError) {
          logError(updateError as Error, {
            context: "auto_cleanup_grievance_auto_close_update",
            grievanceId: g.id,
          });
          result.errors++;
          continue;
        }

        // Notify both audiences. Failures are non-blocking.
        await sendGrievanceAutoClosed({
          audience: "user",
          grievanceId: g.id,
          subject: g.subject,
          userEmail: g.email,
        }).catch((err) =>
          logError(err as Error, {
            context: "auto_cleanup_grievance_auto_close_user_email",
            grievanceId: g.id,
          })
        );

        await sendGrievanceAutoClosed({
          audience: "officer",
          grievanceId: g.id,
          subject: g.subject,
          userEmail: g.email,
        }).catch((err) =>
          logError(err as Error, {
            context: "auto_cleanup_grievance_auto_close_officer_email",
            grievanceId: g.id,
          })
        );

        await logDataAccess({
          tableName: "grievances",
          operation: "UPDATE",
          rowCount: 1,
          endpoint: "auto-cleanup",
          reason: `Auto-closed grievance ${g.id} after ${SILENCE_AUTO_CLOSE_DAYS} days of user silence`,
        });

        logSecurityEvent("grievance_auto_closed_silence", {
          grievanceId: g.id,
        });

        result.deleted++;
      } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)), {
          context: "auto_cleanup_grievance_auto_close_per_row",
          grievanceId: g.id,
        });
        result.errors++;
      }
    }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: "auto_cleanup_grievance_auto_close",
    });
    result.errors++;
  }

  return result;
}

// ─── Stale Correction Requests ──────────────────────────────────────────────

/**
 * Anonymise correction_requests rows whose terminal state (approved/rejected)
 * is more than 90 days old. The audit residue (status, field_name,
 * processed_by, processed_at) is preserved so admins can still demonstrate
 * what was decided; the PII payload (email, current_value, requested_value,
 * ip_address, user_agent) is nulled. 90 days matches the DPDP Rule 14(3)
 * grievance appeal window.
 */
export async function anonymiseStaleCorrectionRequests(): Promise<CleanupResult> {
  const supabase = createServiceClient();
  const result: CleanupResult = { notified: 0, errors: 0 };

  try {
    const cutoff = subDays(new Date(), TERMINAL_REQUEST_ANONYMISE_DAYS);

    const { data: anonymised, error } = await supabase
      .from("correction_requests")
      .update({
        email: null,
        current_value: null,
        requested_value: null,
        ip_address: null,
        user_agent: null,
        anonymised_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("status", ["approved", "rejected"])
      .is("anonymised_at", null)
      .lt("processed_at", cutoff.toISOString())
      .select("id");

    if (error) {
      logError(error as Error, {
        context: "auto_cleanup_anonymise_correction_requests",
      });
      result.errors++;
      return result;
    }

    result.notified = anonymised?.length || 0;

    if (result.notified > 0) {
      await logDataAccess({
        tableName: "correction_requests",
        operation: "UPDATE",
        queryType: "bulk",
        rowCount: result.notified,
        endpoint: "auto-cleanup",
        reason: `Anonymised ${result.notified} terminal-state correction_requests row(s) past ${TERMINAL_REQUEST_ANONYMISE_DAYS}-day window (DPDP §4 / §8(7))`,
      });

      logSecurityEvent("auto_cleanup_correction_requests", {
        anonymisedCount: result.notified,
      });
    }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: "auto_cleanup_anonymise_correction_requests",
    });
    result.errors++;
  }

  return result;
}

// ─── Stale Review Tokens ────────────────────────────────────────────────────

const REVIEW_TOKEN_STALE_GRACE_DAYS = 30;

/**
 * Two-step cleanup for review_tokens, both targeting DPDP §8(7) erasure
 * (token row carries `guest_email` PII that has no purpose post-consumption
 * or post-expiry). Tokens are issued with a 30-day TTL on delivery
 * (`app/api/webhooks/shiprocket/route.ts`), so the grace below gives a
 * 60-day total row lifetime for unused tokens.
 *
 *   Step 1 — recovery: delete token rows that have a corresponding review.
 *     After a successful inline delete (see `app/api/reviews/submit/route.ts`)
 *     the FK on `reviews.review_token_id` (ON DELETE SET NULL) leaves the
 *     review with `review_token_id = NULL`. So any review whose
 *     `review_token_id` is still set points at a token row that survived
 *     consumption — its inline delete failed and the row must go now,
 *     regardless of `expires_at`.
 *
 *   Step 2 — stale unused: delete token rows whose `expires_at` is more
 *     than 30 days in the past.
 */
export async function purgeStaleReviewTokens(): Promise<DeletionResult> {
  const supabase = createServiceClient();
  const result: DeletionResult = { deleted: 0, errors: 0 };

  try {
    // Step 1 — recovery: tokens referenced by a review (= consumed) but not
    // yet deleted. Bounded by total reviews ever submitted; no pagination.
    const { data: stuckRefs, error: stuckQueryError } = await supabase
      .from("reviews")
      .select("review_token_id")
      .not("review_token_id", "is", null);

    if (stuckQueryError) {
      logError(stuckQueryError as Error, {
        context: "auto_cleanup_purge_review_tokens_stuck_query",
      });
      result.errors++;
    } else {
      const stuckIds = (stuckRefs || [])
        .map((r) => r.review_token_id as string)
        .filter(Boolean);

      if (stuckIds.length > 0) {
        const { data: recovered, error: recoverError } = await supabase
          .from("review_tokens")
          .delete()
          .in("id", stuckIds)
          .select("id");

        if (recoverError) {
          logError(recoverError as Error, {
            context: "auto_cleanup_purge_review_tokens_recovery",
          });
          result.errors++;
        } else {
          result.deleted += recovered?.length || 0;
        }
      }
    }

    // Step 2 — stale unused tokens past their expiry + grace window.
    const cutoff = subDays(new Date(), REVIEW_TOKEN_STALE_GRACE_DAYS);

    const { data: stale, error: staleError } = await supabase
      .from("review_tokens")
      .delete()
      .lt("expires_at", cutoff.toISOString())
      .select("id");

    if (staleError) {
      logError(staleError as Error, {
        context: "auto_cleanup_purge_review_tokens_stale",
      });
      result.errors++;
    } else {
      result.deleted += stale?.length || 0;
    }

    if (result.deleted > 0) {
      await logDataAccess({
        tableName: "review_tokens",
        operation: "DELETE",
        queryType: "bulk",
        rowCount: result.deleted,
        endpoint: "auto-cleanup",
        reason: `Purged ${result.deleted} review_tokens row(s) — consumed-but-stuck + stale-unused (DPDP §8(7))`,
      });

      logSecurityEvent("auto_cleanup_review_tokens", {
        deletedCount: result.deleted,
      });
    }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: "auto_cleanup_purge_review_tokens",
    });
    result.errors++;
  }

  return result;
}

// ─── Stale Guest Data Sessions ─────────────────────────────────────────────

/**
 * Delete guest_data_sessions rows whose OTP, session, and lockout windows have
 * all elapsed — at that point the row's purpose (auth + rate-limit memory) is
 * fully served and §8(7) requires erasure. The unique-on-email constraint
 * means a returning visitor gets a fresh row regardless.
 */
export async function purgeExpiredGuestSessions(): Promise<DeletionResult> {
  const supabase = createServiceClient();
  const result: DeletionResult = { deleted: 0, errors: 0 };

  try {
    const now = new Date();

    // PostgREST's `.or()` parser is fragile when filter values contain dots
    // (ISO timestamps include `.123Z` milliseconds), so we SELECT all rows
    // and filter in-code, then DELETE by id. At Trishikha's scale the table
    // is small (one row per email at a time, purged daily) — full scan is
    // cheap.
    const { data: rows, error: selectError } = await supabase
      .from("guest_data_sessions")
      .select("id, otp_expires_at, session_expires_at, otp_locked_until");

    if (selectError) {
      logError(selectError as Error, {
        context: "auto_cleanup_purge_guest_sessions_select",
      });
      result.errors++;
      return result;
    }

    // A row is purgeable if every time-based reason to keep it has passed.
    // NULL means "no such window was set", which is also "not blocking deletion".
    const expiredIds = (rows || [])
      .filter((r) => {
        const otpOk = !r.otp_expires_at || new Date(r.otp_expires_at) < now;
        const sessOk = !r.session_expires_at || new Date(r.session_expires_at) < now;
        const lockOk = !r.otp_locked_until || new Date(r.otp_locked_until) < now;
        return otpOk && sessOk && lockOk;
      })
      .map((r) => r.id as string);

    if (expiredIds.length === 0) return result;

    const { error: deleteError } = await supabase
      .from("guest_data_sessions")
      .delete()
      .in("id", expiredIds);

    if (deleteError) {
      logError(deleteError as Error, {
        context: "auto_cleanup_purge_guest_sessions_delete",
      });
      result.errors++;
      return result;
    }

    result.deleted = expiredIds.length;

    if (result.deleted > 0) {
      await logDataAccess({
        tableName: "guest_data_sessions",
        operation: "DELETE",
        queryType: "bulk",
        rowCount: result.deleted,
        endpoint: "auto-cleanup",
        reason: `Purged ${result.deleted} expired guest_data_sessions row(s) (DPDP §8(7) — purpose served)`,
      });

      logSecurityEvent("auto_cleanup_guest_sessions", {
        deletedCount: result.deleted,
      });
    }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: "auto_cleanup_purge_guest_sessions",
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
        // Scrub Razorpay's `notes` PII for every order tied to this email
        // before the local DELETE. Matches the pattern in
        // deleteAbandonedCheckouts: SELECT → scrub → DELETE.
        const { data: orderRows } = await supabase
          .from("orders")
          .select("razorpay_order_id")
          .eq("guest_email", request.guest_email);

        await Promise.all(
          (orderRows || [])
            .map((o) => o.razorpay_order_id)
            .filter((id): id is string => Boolean(id))
            .map((id) => scrubRazorpayNotes(id))
        );

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
