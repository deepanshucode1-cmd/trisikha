import { NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { logSecurityEvent, logError } from "@/lib/logger";
import { createServiceClient } from "@/utils/supabase/service";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * GET /api/user/export-data
 *
 * GDPR Data Portability - Exports all user data in machine-readable JSON format
 * Requires authentication
 */
export async function GET(request: Request) {
  try {
    // Rate limiting - 5 exports per hour to prevent abuse
    const ip = getClientIp(request);
    const { success } = await apiRateLimit.limit(`export:${ip}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many export requests. Please try again later." },
        { status: 429 }
      );
    }

    // Require authentication
    const { user } = await requireAuth();
    const userId = user.id;
    const userEmail = user.email;

    // Use service client to bypass RLS and get all user data
    const supabase = createServiceClient();

    // Fetch user profile
    const { data: profile } = await supabase
      .from("user_role")
      .select("*")
      .eq("id", userId)
      .single();

    // Fetch user's orders
    const { data: orders } = await supabase
      .from("orders")
      .select(`
        id,
        guest_email,
        guest_phone,
        total_amount,
        currency,
        payment_status,
        shipping_status,
        shipping_first_name,
        shipping_last_name,
        shipping_address_line1,
        shipping_address_line2,
        shipping_city,
        shipping_state,
        shipping_pincode,
        shipping_country,
        billing_first_name,
        billing_last_name,
        billing_address_line1,
        billing_address_line2,
        billing_city,
        billing_state,
        billing_pincode,
        billing_country,
        reason_for_cancellation,
        created_at,
        updated_at
      `)
      .or(`user_id.eq.${userId},guest_email.eq.${userEmail}`);

    // Fetch order items for user's orders
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

    // Compile export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      dataController: {
        name: "Trishikha Organics",
        email: process.env.SUPPORT_EMAIL || "support@trishikhaorganics.com",
      },
      user: {
        id: userId,
        email: userEmail,
        role: profile?.role || "customer",
        accountCreatedAt: profile?.created_at,
      },
      orders: orders?.map(order => ({
        ...order,
        items: orderItems.filter((item: Record<string, unknown>) => item.order_id === order.id),
      })) || [],
      dataRetentionPolicy: {
        orderData: "Retained for 7 years for tax compliance",
        accountData: "Retained until account deletion",
        paymentData: "Handled by Razorpay - see their privacy policy",
      },
    };

    // Log the export event
    logSecurityEvent("user_data_export", {
      userId,
      email: userEmail,
      ordersCount: orders?.length || 0,
    });

    // Return as downloadable JSON
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="user-data-export-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (err) {
    // Handle auth errors
    const authResponse = handleAuthError(err);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(err as Error, { endpoint: "/api/user/export-data" });
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    );
  }
}
