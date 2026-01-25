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
 * POST /api/guest/export-data
 *
 * Exports all data for a verified guest email in JSON format
 * DPDP Act - Right to Data Portability
 */
export async function POST(req: Request) {
  try {
    // Rate limiting - 3 exports per hour
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`guest-export:${ip}`);

    if (!success) {
      return NextResponse.json(
        { error: "Too many export requests. Please try again later." },
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
      logSecurityEvent("guest_export_invalid_session", {
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

    // Compile export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      dataController: {
        name: "Trishikha Organics",
        email: process.env.SUPPORT_EMAIL || "trishikhaorganic@gmail.com",
        address: "Plot No 27, Swagat Industrial Area Park, Vill. Dhanot, Kadi Chatral Road, Ta. Kalol, Distt: Gandhi Nagar, Gujarat",
      },
      dataSubject: {
        email: normalizedEmail,
        type: "guest",
      },
      orders: orders?.map(order => ({
        ...order,
        items: orderItems.filter((item: Record<string, unknown>) => item.order_id === order.id),
      })) || [],
      dataRetentionPolicy: {
        orderData: "Retained for 7 years for tax compliance (as per Income Tax Act)",
        personalData: "Available for deletion upon request (anonymization)",
        paymentData: "Handled by Razorpay - see their privacy policy at https://razorpay.com/privacy/",
      },
      yourRights: {
        access: "You have exercised this right by downloading this export",
        correction: "Contact us at trishikhaorganic@gmail.com to correct your data",
        deletion: "You can request deletion through the My Data page",
        portability: "This export provides your data in machine-readable JSON format",
      },
      legalBasis: "DPDP Act 2023 - Right to Data Portability (Section 11)",
    };

    // Log the export for audit
    await logDataAccess({
      tableName: "orders",
      operation: "SELECT",
      ip,
      queryType: "export",
      rowCount: orders?.length || 0,
      endpoint: "/api/guest/export-data",
      reason: "DPDP data portability request",
    });

    logSecurityEvent("guest_data_exported", {
      email: normalizedEmail,
      ip,
      ordersCount: orders?.length || 0,
    });

    // Return as downloadable JSON
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="trishikha-data-export-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/export-data",
    });
  }
}
