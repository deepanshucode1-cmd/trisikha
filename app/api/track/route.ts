import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import shiprocket from "@/utils/shiprocket";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("order_id");

  if (!orderId) {
    return NextResponse.json({ error: "order_id missing" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!order.shiprocket_awb_code) {
    return NextResponse.json({
      stage: "ORDER_PLACED",
      order,
    });
  }


  const token = await shiprocket.login();

  const trackingRes = await fetch(
    `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.shiprocket_awb_code}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log(trackingRes);

  const tracking = await trackingRes.json();

  return NextResponse.json({
    stage: "AWB_ASSIGNED",
    order,
    shiprocket: tracking,
  });
}
