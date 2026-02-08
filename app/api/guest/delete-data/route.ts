import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { z } from "zod";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";
import {
  createDeletionRequest,
  DELETION_WINDOW_DAYS,
  markReminderSent,
} from "@/lib/deletion-request";
import { sendDeletionRequestConfirmation } from "@/lib/email";

const requestSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  sessionToken: z.string().min(1, "Session token required"),
  confirmPhrase: z.literal("DELETE MY DATA", {
    message: "Please type 'DELETE MY DATA' to confirm",
  }),
});

/**
 * POST /api/guest/delete-data
 *
 * Creates a pending deletion request with a 14-day window period
 * DPDP Act - Right to Erasure with cooling-off period
 *
 * Note: Data is not immediately deleted - user has 14 days to cancel
 */
export async function POST(req: Request) {
  try {
    // Rate limiting - 2 deletion requests per hour
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`guest-delete:${ip}`);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const parseResult = requestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { email, sessionToken } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const supabase = createServiceClient();

    // Verify session token from guest_data_sessions
    const { data: session, error: sessionError } = await supabase
      .from("guest_data_sessions")
      .select("id, session_token, session_expires_at")
      .eq("email", normalizedEmail)
      .eq("session_token", sessionToken)
      .single();

    if (sessionError || !session) {
      logSecurityEvent("guest_delete_invalid_session", {
        email: normalizedEmail,
        ip,
      });

      return NextResponse.json(
        { error: "Invalid or expired session. Please verify your email again." },
        { status: 401 }
      );
    }

    // Check if session has expired
    if (new Date(session.session_expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Session has expired. Please verify your email again." },
        { status: 401 }
      );
    }

    // Check for active orders (pending, booked, shipped)
    const { data: activeOrders, error: activeError } = await supabase
      .from("orders")
      .select("id, shipping_status")
      .eq("guest_email", normalizedEmail)
      .in("shipping_status", ["pending", "booked", "shipped"]);

    if (activeError) {
      throw new Error("Failed to check active orders");
    }

    if (activeOrders && activeOrders.length > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete data with active orders",
          details: "Please wait for all orders to be delivered or cancelled before requesting deletion.",
          activeOrdersCount: activeOrders.length,
        },
        { status: 400 }
      );
    }

    // Count orders to be anonymized
    const { data: ordersToAnonymize } = await supabase
      .from("orders")
      .select("id")
      .eq("guest_email", normalizedEmail);

    const orderCount = ordersToAnonymize?.length || 0;

    // Create a pending deletion request (not immediate deletion)
    const userAgent = req.headers.get("user-agent") || undefined;
    const result = await createDeletionRequest({
      email: normalizedEmail,
      ip,
      userAgent,
      ordersCount: orderCount,
    });

    // Send confirmation email (non-blocking)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://trisikhaorganics.com";
    sendDeletionRequestConfirmation({
      email: normalizedEmail,
      requestId: result.requestId,
      scheduledDate: result.scheduledAt,
      cancelUrl: `${baseUrl}/my-data`,
    })
      .then(() => markReminderSent(result.requestId, "confirmation"))
      .catch((err) => {
        console.error("Failed to send deletion confirmation email:", err);
      });

    // Return appropriate response based on whether this is a new or existing request
    if (result.alreadyPending) {
      return NextResponse.json({
        success: true,
        message: "You already have a pending deletion request.",
        details: {
          requestId: result.requestId,
          scheduledDeletionDate: result.scheduledAt.toISOString(),
          windowPeriodDays: DELETION_WINDOW_DAYS,
          ordersToBeAnonymized: orderCount,
          cancelInstructions: "You can cancel this request anytime before the scheduled date by visiting /my-data",
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Your deletion request has been received.",
      details: {
        requestId: result.requestId,
        scheduledDeletionDate: result.scheduledAt.toISOString(),
        windowPeriodDays: DELETION_WINDOW_DAYS,
        ordersToBeAnonymized: orderCount,
        cancelInstructions: "You can cancel this request anytime before the scheduled date by visiting /my-data",
        note: `Your data will be anonymized on ${result.scheduledAt.toLocaleDateString()}. A confirmation email has been sent.`,
      },
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/delete-data",
    });
  }
}
