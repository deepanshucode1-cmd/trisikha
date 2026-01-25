import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { z } from "zod";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";

const requestSchema = z.object({
  email: z.string().email("Invalid email address"),
  sessionToken: z.string().min(1, "Session token required"),
  confirmPhrase: z.literal("DELETE MY DATA", {
    errorMap: () => ({ message: "Please type 'DELETE MY DATA' to confirm" }),
  }),
});

/**
 * POST /api/guest/delete-data
 *
 * Anonymizes all data for a verified guest email
 * DPDP Act - Right to Erasure
 *
 * Note: Order data is retained for tax compliance but anonymized
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

    // Anonymize all order data
    const anonymizedEmail = `deleted-${Date.now()}@anonymized.local`;
    const anonymizedPhone = "0000000000";
    const anonymizedName = "Deleted User";
    const anonymizedAddress = "Address Removed";

    const { error: anonymizeError } = await supabase
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
      .eq("guest_email", normalizedEmail);

    if (anonymizeError) {
      throw new Error("Failed to anonymize data");
    }

    // Log the deletion for audit
    await logDataAccess({
      tableName: "orders",
      operation: "UPDATE",
      ip,
      queryType: "bulk",
      rowCount: orderCount,
      endpoint: "/api/guest/delete-data",
      reason: "DPDP right to erasure request - data anonymized",
    });

    logSecurityEvent("guest_data_deleted", {
      originalEmail: normalizedEmail,
      anonymizedEmail,
      ip,
      ordersAnonymized: orderCount,
      deletedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Your personal data has been successfully anonymized.",
      details: {
        ordersAnonymized: orderCount,
        note: "Order records are retained for tax compliance but all identifying information has been removed.",
      },
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/delete-data",
    });
  }
}
