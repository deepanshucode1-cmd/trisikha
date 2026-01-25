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
});

/**
 * POST /api/guest/get-data
 *
 * Returns all orders for a verified guest email
 * Requires valid session token from OTP verification
 */
export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`guest-data:${ip}`);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const { email, sessionToken } = requestSchema.parse(body);
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
      logSecurityEvent("guest_data_invalid_session", {
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
      // Clear expired session
      await supabase
        .from("guest_data_sessions")
        .update({ session_token: null, session_expires_at: null })
        .eq("id", session.id);

      return NextResponse.json(
        { error: "Session has expired. Please verify your email again." },
        { status: 401 }
      );
    }

    // Fetch all orders for this email
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(`
        id,
        guest_email,
        guest_phone,
        total_amount,
        currency,
        payment_status,
        shipping_status,
        order_status,
        shipping_first_name,
        shipping_last_name,
        shipping_address_line1,
        shipping_address_line2,
        shipping_city,
        shipping_state,
        shipping_pincode,
        shipping_country,
        created_at,
        updated_at
      `)
      .eq("guest_email", normalizedEmail)
      .not("guest_email", "like", "deleted-%")
      .order("created_at", { ascending: false });

    if (ordersError) {
      throw new Error("Failed to fetch orders");
    }

    // Fetch order items
    const orderIds = orders?.map(o => o.id) || [];
    let orderItems: Record<string, unknown>[] = [];

    if (orderIds.length > 0) {
      const { data: items } = await supabase
        .from("order_items")
        .select(`
          id,
          order_id,
          product_name,
          quantity,
          unit_price,
          created_at
        `)
        .in("order_id", orderIds);

      orderItems = items || [];
    }

    // Audit log for DPDP compliance
    await logDataAccess({
      tableName: "orders",
      operation: "SELECT",
      ip,
      queryType: "single",
      rowCount: orders?.length || 0,
      endpoint: "/api/guest/get-data",
      reason: "DPDP data access request",
    });

    logSecurityEvent("guest_data_accessed", {
      email: normalizedEmail,
      ip,
      ordersCount: orders?.length || 0,
    });

    return NextResponse.json({
      success: true,
      email: normalizedEmail,
      ordersCount: orders?.length || 0,
      orders: orders?.map(order => ({
        ...order,
        items: orderItems.filter((item: Record<string, unknown>) => item.order_id === order.id),
      })) || [],
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/get-data",
    });
  }
}
