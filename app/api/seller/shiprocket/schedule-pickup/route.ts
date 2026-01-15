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

    const body = await req.json();
    const orderId = body.orderId;

    if (!orderId) {
      return NextResponse.json(
        { error: "Missing orderId" },
        { status: 400 }
      );
    }

    // 1️⃣ Fetch order details (ensure shipment exists)
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id, shiprocket_shipment_id"
      )
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
        { error: "Shipment ID missing. Cannot schedule pickup." },
        { status: 400 }
      );
    }

    // 2️⃣ Call Shiprocket API to schedule pickup
    const pickupRes = await shiprocket.schedulePickup(order.shiprocket_shipment_id);

    if (!pickupRes || !pickupRes.pickup_scheduled) {
      return NextResponse.json(
        { error: "Failed to schedule pickup" },
        { status: 500 }
      );
    }

    // 3️⃣ Update DB with pickup status
    await supabase
      .from("orders")
      .update({
        shiprocket_status: "PICKUP_SCHEDULED",
        pickup_scheduled_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    logOrder("pickup_scheduled", { orderId, pickup_data: pickupRes });

    return NextResponse.json({
      success: true,
      message: "Pickup scheduled successfully",
      data: pickupRes,
    });
  } catch (err) {
    // Handle auth errors specifically
    const authResponse = handleAuthError(err);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(err as Error, { endpoint: "/api/seller/shiprocket/schedule-pickup" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
