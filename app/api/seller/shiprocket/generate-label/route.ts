import { NextResponse } from "next/server";
import shiprocket from "@/utils/shiprocket";
import { logError, logOrder } from "@/lib/logger";
import { requireRole, handleAuthError } from "@/lib/auth";
import { adminShippingRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success } = await adminShippingRateLimit.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Authentication - require admin role
    const { supabase } = await requireRole("admin");

    const params = await req.json();
    const orderId = params.orderId;

    if (!orderId) {
      return NextResponse.json(
        { error: "Missing orderId" },
        { status: 400 }
      );
    }

    // 1️⃣ Fetch order details
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, shiprocket_shipment_id")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    if (!order.shiprocket_shipment_id) {
      return NextResponse.json(
        {
          error:
            "Shiprocket shipment ID missing. Ensure order was pushed to Shiprocket.",
        },
        { status: 400 }
      );
    }

    // 2️⃣ Call Shiprocket Generate Label
    const labelRes = await shiprocket.generateLabel(
      order.shiprocket_shipment_id
    );

    if (!labelRes || !labelRes.label_url) {
      return NextResponse.json(
        { error: "Shiprocket failed to generate label" },
        { status: 500 }
      );
    }

    // 3️⃣ Store label URL in DB
    await supabase
      .from("orders")
      .update({
        shiprocket_label_url: labelRes.label_url,
      })
      .eq("id", orderId);

    logOrder("label_generated", { orderId, label_url: labelRes.label_url });

    return NextResponse.json({
      success: true,
      label_url: labelRes.label_url,
    });
  } catch (err) {
    // Handle auth errors specifically
    const authResponse = handleAuthError(err);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(err as Error, { endpoint: "/api/seller/shiprocket/generate-label" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
