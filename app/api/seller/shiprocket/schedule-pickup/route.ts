import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import shiprocket from "@/utils/shiprocket";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orderId = body.orderId;

    console.log(body);
    console.log("Scheduling pickup for order ID:", orderId);
    if (!orderId) {
      return NextResponse.json(
        { error: "Missing orderId" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

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

    return NextResponse.json({
      success: true,
      message: "Pickup scheduled successfully",
      data: pickupRes,
    });
  } catch (err: any) {
    console.error("Schedule pickup API error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
