import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import crypto from "crypto";
import nodemailer from "nodemailer";

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


  const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: emailOrPhone,
      subject: "TrishikhaOrganics: Your OTP for Order Cancellation",
      text: `Hi,\n\n Your OTP for cancelling order ${orderId} is: ${otp}. It is valid for 10 minutes.\n\nIf you did not request this, please ignore this email.\n\nThank you,\nTrishikhaOrganics Team`,
    });

  return NextResponse.json({ success: true });
}
