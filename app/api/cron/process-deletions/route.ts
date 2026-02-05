import { NextResponse } from "next/server";
import { logError, logSecurityEvent } from "@/lib/logger";
import {
  getRequestsNeedingReminders,
  markRequestsAsEligible,
  markReminderSent,
  getDaysRemaining,
} from "@/lib/deletion-request";
import { sendDeletionReminder } from "@/lib/email";

/**
 * Verify QStash signature for cron job security
 */
async function verifyQStashSignature(req: Request): Promise<boolean> {
  const signature = req.headers.get("upstash-signature");

  // If no QStash keys configured, allow in development
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY) {
    if (process.env.NODE_ENV === "development") {
      console.warn("QStash signature verification skipped in development");
      return true;
    }
    return false;
  }

  if (!signature) {
    return false;
  }

  try {
    // Dynamic import to handle cases where package isn't installed
    const { Receiver } = await import("@upstash/qstash");

    const receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || "",
    });

    const body = await req.text();
    const url = req.url;

    const isValid = await receiver.verify({
      signature,
      body,
      url,
    });

    return isValid;
  } catch (err) {
    logError(err as Error, { context: "qstash_signature_verification_failed" });
    return false;
  }
}

/**
 * POST /api/cron/process-deletions
 *
 * Processes scheduled deletion requests:
 * 1. Marks requests as 'eligible' when 14-day window expires (does NOT execute)
 * 2. Sends reminder emails (day 1, 7, 13)
 *
 * Actual deletion execution requires admin approval via admin dashboard.
 *
 * Called daily by Upstash QStash
 */
export async function POST(req: Request) {
  try {
    // Verify QStash signature
    const isValid = await verifyQStashSignature(req);
    if (!isValid) {
      logSecurityEvent("cron_unauthorized_access", {
        endpoint: "/api/cron/process-deletions",
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = {
      markedEligible: 0,
      remindersDay1Sent: 0,
      remindersDay7Sent: 0,
      remindersDay13Sent: 0,
      remindersFailed: 0,
    };

    // Mark requests as eligible when 14-day window expires
    // NOTE: This does NOT execute deletions - admin must approve via dashboard
    results.markedEligible = await markRequestsAsEligible();

    // Send reminder emails
    const reminders = await getRequestsNeedingReminders();
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || "https://trisikhaorganics.com";

    // Day 1 reminders (13 days remaining)
    for (const request of reminders.day1) {
      try {
        await sendDeletionReminder({
          email: request.guest_email,
          daysRemaining: getDaysRemaining(request.scheduled_deletion_at),
          scheduledDate: new Date(request.scheduled_deletion_at),
          cancelUrl: `${baseUrl}/my-data`,
        });
        await markReminderSent(request.id, "day1");
        results.remindersDay1Sent++;
      } catch (err) {
        results.remindersFailed++;
        logError(err as Error, {
          context: "cron_reminder_day1_failed",
          requestId: request.id,
        });
      }
    }

    // Day 7 reminders (7 days remaining)
    for (const request of reminders.day7) {
      try {
        await sendDeletionReminder({
          email: request.guest_email,
          daysRemaining: getDaysRemaining(request.scheduled_deletion_at),
          scheduledDate: new Date(request.scheduled_deletion_at),
          cancelUrl: `${baseUrl}/my-data`,
        });
        await markReminderSent(request.id, "day7");
        results.remindersDay7Sent++;
      } catch (err) {
        results.remindersFailed++;
        logError(err as Error, {
          context: "cron_reminder_day7_failed",
          requestId: request.id,
        });
      }
    }

    // Day 13 reminders (1 day remaining)
    for (const request of reminders.day13) {
      try {
        await sendDeletionReminder({
          email: request.guest_email,
          daysRemaining: getDaysRemaining(request.scheduled_deletion_at),
          scheduledDate: new Date(request.scheduled_deletion_at),
          cancelUrl: `${baseUrl}/my-data`,
        });
        await markReminderSent(request.id, "day13");
        results.remindersDay13Sent++;
      } catch (err) {
        results.remindersFailed++;
        logError(err as Error, {
          context: "cron_reminder_day13_failed",
          requestId: request.id,
        });
      }
    }

    logSecurityEvent("cron_process_deletions_completed", {
      ...results,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message:
        "Deletion processing completed. Eligible requests require admin approval.",
      results,
    });
  } catch (error) {
    logError(error as Error, {
      context: "cron_process_deletions_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing in development
export async function GET(req: Request) {
  // Only allow in development
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Reuse POST handler
  return POST(req);
}
