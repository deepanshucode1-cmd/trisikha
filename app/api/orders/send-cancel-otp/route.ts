import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import crypto from "crypto";

export async function POST(req: Request) {
  const { orderId, emailOrPhone } = await req.json();

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await supabase
    .from("orders")
    .update({
      cancellation_status: "OTP_SENT",
      otp_code: otp,
      otp_expires_at: expiresAt,
    })
    .eq("id", orderId);

  // ✅ SEND OTP VIA SMS / EMAIL HERE
  console.log("OTP:", otp);

  return NextResponse.json({ success: true });
}
