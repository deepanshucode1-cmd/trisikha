import { NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { createClient } from "@/utils/supabase/server";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  try {
    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();

    if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    // 1. Verify Signature using timingSafeEqual
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest("hex");

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(razorpay_signature)
    );

    if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

    // 2. Double-check status with Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.status !== "captured" && payment.status !== "authorized") {
       return NextResponse.json({ error: "Payment failed at gateway" }, { status: 400 });
    }

    // 3. Update Database
    // 3. Update Database
    const supabase = await createClient();
const { data, error } = await supabase
  .from("orders")
  .update({
    payment_status: "paid",
    order_status : 'CONFIRMED', shiprocket_status : 'NOT_SHIPPED',
    payment_id: razorpay_payment_id,
    updated_at: new Date().toISOString(),
  })
  .eq("id", order_id)
  .eq("payment_status", "initiated") // This prevents double-processing
  .select();

// If there's a genuine Postgres error (connection, syntax, etc.)
if (error) {
  // 🚨 CRITICAL: Money is gone, but DB failed to update.
  // 1. Log this with HIGH PRIORITY (e.g., Sentry, Slack alert, console.error)
  console.error("CRITICAL: Payment captured but DB update failed", {
    order_id,
    razorpay_payment_id,
    db_error: error
  });

  // 2. DO NOT return an error to the user.
  // Return success so the frontend redirects them to a "Success" page.
  // The user will see "Order Placed" (even if the internal status is laggy).
  return NextResponse.json({ 
    success: true, 
    warning: "Payment captured, order status pending sync" 
  });
}

// If no rows were updated, it means the order is already 'paid' 
// or the order_id doesn't exist.
if (data.length === 0) {
  // We check if it's already paid to confirm success
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("payment_status")
    .eq("id", order_id)
    .single();

  if (existingOrder?.payment_status === "paid") {
    return NextResponse.json({ success: true, message: "Already processed" });
  }

  return NextResponse.json({ error: "Order not found" }, { status: 404 });
}else{
    return NextResponse.json({ success: true });
}
  } catch (err) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}