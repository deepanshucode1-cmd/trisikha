import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { sendReviewRequest } from "@/lib/email";
import { logError, logSecurityEvent } from "@/lib/logger";

/**
 * Verify QStash signature for cron job security
 */
async function verifyQStashSignature(req: Request): Promise<boolean> {
  const signature = req.headers.get("upstash-signature");

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
    const { Receiver } = await import("@upstash/qstash");

    const receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || "",
    });

    const body = await req.text();
    const url = req.url;

    const isValid = await receiver.verify({ signature, body, url });
    return isValid;
  } catch (err) {
    logError(err as Error, { context: "qstash_review_email_verification_failed" });
    return false;
  }
}

/**
 * POST /api/cron/send-review-emails
 *
 * Weekly cron job that sends review request emails to customers
 * whose orders were delivered 7+ days ago.
 *
 * Checks:
 * - Order status is DELIVERED
 * - Delivered at least 7 days ago
 * - Review email not yet sent
 * - No return in progress
 */
export async function POST(req: Request) {
  try {
    const isValid = await verifyQStashSignature(req);
    if (!isValid) {
      logSecurityEvent("cron_unauthorized_access", {
        endpoint: "/api/cron/send-review-emails",
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Find orders eligible for review emails
    const { data: eligibleOrders, error: queryError } = await supabase
      .from("orders")
      .select("id, guest_email")
      .eq("order_status", "DELIVERED")
      .eq("return_status", "NOT_REQUESTED")
      .is("review_email_sent_at", null)
      .lte("delivered_at", sevenDaysAgo)
      .limit(50);

    if (queryError) {
      logError(new Error("Failed to query eligible orders for review emails"), {
        error: queryError.message,
      });
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    const results = {
      processed: 0,
      emailsSent: 0,
      skipped: 0,
      errors: 0,
    };

    for (const order of eligibleOrders || []) {
      results.processed++;

      try {
        // Fetch unconsumed review tokens for this order
        const { data: tokens, error: tokenError } = await supabase
          .from("review_tokens")
          .select("token, product_name")
          .eq("order_id", order.id)
          .is("consumed_at", null);

        if (tokenError || !tokens || tokens.length === 0) {
          results.skipped++;
          continue;
        }

        const reviewLinks = tokens.map((t) => ({
          productName: t.product_name,
          token: t.token,
        }));

        const sent = await sendReviewRequest(
          order.guest_email,
          order.id,
          reviewLinks
        );

        if (sent) {
          // Mark email as sent regardless of individual token status
          await supabase
            .from("orders")
            .update({ review_email_sent_at: new Date().toISOString() })
            .eq("id", order.id);

          results.emailsSent++;
        } else {
          results.errors++;
          logError(new Error("Review email send failed"), {
            orderId: order.id,
          });
        }
      } catch (err) {
        results.errors++;
        logError(err as Error, {
          context: "cron_review_email_processing_failed",
          orderId: order.id,
        });
      }
    }

    logSecurityEvent("cron_review_emails_completed", {
      ...results,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Review email processing completed",
      results,
    });
  } catch (error) {
    logError(error as Error, { context: "cron_review_emails_error" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Allow GET for manual testing in development
export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }
  return POST(req);
}
