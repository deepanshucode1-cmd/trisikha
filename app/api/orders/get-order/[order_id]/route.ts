import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: { order_id: string } }
) {

  const {order_id} = await params;
  console.log("Fetching order with ID:", order_id);
  try {
    const supabase = await createClient();

    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        id,
        total_amount,
        payment_status,
        order_status,
        shiprocket_status,
        shiprocket_awb_code,
        tracking_url,
        created_at
      `)
      .eq("id", order_id)
      .single();

    if (error || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(order);
  } catch (err) {
    console.error("Fetch order error:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
