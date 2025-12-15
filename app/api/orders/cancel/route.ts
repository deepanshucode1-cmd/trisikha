import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@/utils/supabase/server";
import shiprocket from "@/utils/shiprocket";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  try {
    const { orderId, otp, reason } = await req.json();
    const supabase = await createClient();

    // ✅ 1. Fetch latest order state
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }

    if(order.order_status === "CHECKED_OUT"){ 
      return NextResponse.json({ error: "Order not confirmed yet" }, { status: 400 });
    }

    // ✅ Block duplicate final cancellation
    if (order.order_status === "CANCELLED") {
      return NextResponse.json({ message: "Order already cancelled" });
    }

    if(order.order_status === "DELIVERED"){
      return NextResponse.json({ error: "Delivered orders cannot be cancelled" });
    }

    if(order.order_status === "SHIPPED"){
      return NextResponse.json({ error: "Shipped orders cannot be cancelled" });
    }
    
    if(order.refund_status === "REFUND_INITIATED" ){
      return NextResponse.json({ message: "Refund already in process" });
    }

    if(order.refund_status === "REFUNDED" ){
      return NextResponse.json({ message: "Order already refunded" });
    }

    
    // ✅ 2. OTP Verification (Only on first cancellation request)
    if (order.cancellation_status === "OTP_SENT") {
      if (
        order.otp_code !== otp ||
        new Date(order.otp_expires_at) < new Date()
      ) {
        return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
      }

      await supabase.from("orders").update({
        order_status: "CANCELLATION_REQUESTED",
        cancellation_status: "CANCELLATION_REQUESTED",
      }).eq("id", orderId);
    }

    // ✅ 3. Re-fetch after OTP update (important for retries)
    const { data: freshOrder, error : freshError} = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (freshError || !freshOrder) {
      return NextResponse.json({ error: "Invalid order" }, { status: 500 });
    }

    // ✅ 4. SHIPROCKET CANCELLATION (ONLY when allowed)
    if (
      freshOrder.shiprocket_order_id &&
      (
        freshOrder.order_status === "CANCELLATION_REQUESTED" && (
        freshOrder.cancellation_status === "CANCELLATION_REQUESTED" &&
        (freshOrder.shiprocket_status === "SHIPPING_CANCELLATION_FAILED" 
          || freshOrder.shiprocket_status === "AWB_ASSIGNED" || freshOrder.shiprocket_status === "PICKUP_SCHEDULED" ))
      )
    ) {
      const token = await shiprocket.login();
      if (!token) {
        await supabase.from("orders").update({
          cancellation_status: "SHIPPING_CANCELLATION_FAILED",
        }).eq("id", orderId);

        return NextResponse.json({ error: "Shiprocket auth failed" }, { status: 500 });
      }

      const srRes = await fetch(
        "https://apiv2.shiprocket.in/v1/external/orders/cancel",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ids: [freshOrder.shiprocket_order_id],
          }),
        }
      );

      if (!srRes.ok) {
        await supabase.from("orders").update({
          shiprocket_status: "SHIPPING_CANCELLATION_FAILED",
        }).eq("id", orderId);

        return NextResponse.json({ error: "Shipping cancellation failed" }, { status: 400 });
      }

      await supabase.from("orders").update({
        shiprocket_status: "SHIPPING_CANCELLED",
      }).eq("id", orderId);
    }

    // ✅ 5. REFUND (Only AFTER shipping cancelled)
    if (
          freshOrder.payment_status === "paid" &&
          (freshOrder.shiprocket_status === "SHIPPING_CANCELLED" || freshOrder.shiprocket_status === "NOT_SHIPPED") &&
          freshOrder.refund_status !== "REFUND_INITIATED" &&
          freshOrder.refund_status !== "REFUNDED"
        ){
      try {
        console.log("payment id:", freshOrder.payment_id);  
        const payment = await razorpay.payments.fetch("pay_RaOtLlHPPhuTQb");
        console.log(payment);

       const razorpay_refund_result =  await razorpay.payments.refund("pay_RaOtLlHPPhuTQb", {
          amount: 100,
        });

        console.log("Razorpay refund result:", razorpay_refund_result); 

        if(razorpay_refund_result.status !== "processed"){
        await supabase.from("orders").update({
          refund_status: "REFUND_INITIATED",
          reason_for_cancellation: reason,
          otp_code: null,
          otp_expires_at: null,
        }).eq("id", orderId);
      }else if(razorpay_refund_result.status === "processed"){
        const  {data : refund_update_data, error : refund_update_error} = await supabase.from("orders").update({
          refund_status: "REFUND_COMPLETED",
          order_status: "CANCELLED",
          cancellation_status : "CANCELLED",
          refund_id : razorpay_refund_result.id,
          refund_amount : razorpay_refund_result.amount,
          refund_initiated_at : new Date().toISOString(),
          refund_completed_at : new Date().toISOString(),
          reason_for_cancellation: reason,
          otp_code: null,
          otp_expires_at: null,
        }).eq("id", orderId);

        console.log("Refund update data:", refund_update_data);
        console.log("Refund update error:", refund_update_error); 
      }

        return NextResponse.json({ success: true });

      } catch (err) {
        await supabase.from("orders").update({
          refund_status: "REFUND_FAILED",
        }).eq("id", orderId);

        console.log("Refund error:", err);
        return NextResponse.json({ error: "Refund failed" }, { status: 500 });
      }
    }

    // ✅ 6. If nothing matched, return safe state response
    return NextResponse.json({
      message: "Cancellation already in progress",
      status: freshOrder.cancellation_status,
    });

  } catch (err) {
    console.error("Cancellation API Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
