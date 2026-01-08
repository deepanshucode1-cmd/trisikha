import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import shiprocket from "@/utils/shiprocket";
import { logError } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const params  = await req.json();
    const orderId = params.orderId;

    if (!orderId) {
      return NextResponse.json(
        { error: "Missing orderId" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

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

    return NextResponse.json({
      success: true,
      label_url: labelRes.label_url,
    });
  } catch (err) {
    logError(err as Error, { endpoint: "/api/seller/shiprocket/generate-label" });
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
