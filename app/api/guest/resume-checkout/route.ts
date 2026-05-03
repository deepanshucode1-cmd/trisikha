import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/utils/supabase/service";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError, getFirstZodError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";
import { hashResumeToken } from "@/lib/resume-token";

const requestSchema = z.object({
  token: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`resume-checkout:${ip}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parseResult = requestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: getFirstZodError(parseResult.error) },
        { status: 400 }
      );
    }

    const { token } = parseResult.data;
    const hash = hashResumeToken(token);
    const supabase = createServiceClient();

    const { data: order } = await supabase
      .from("orders")
      .select(
        "id, total_amount, currency, razorpay_order_id, order_status, payment_status, resume_token_expires_at, resume_token_used_at"
      )
      .eq("resume_token_hash", hash)
      .maybeSingle();

    if (!order) {
      logSecurityEvent("resume_checkout_invalid_token", { ip });
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
    }

    if (order.resume_token_used_at) {
      return NextResponse.json({ error: "This link has already been used" }, { status: 410 });
    }

    if (new Date(order.resume_token_expires_at) < new Date()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 });
    }

    if (order.payment_status === "paid") {
      return NextResponse.json({ error: "Order already paid" }, { status: 409 });
    }

    if (order.order_status !== "CHECKED_OUT" || order.payment_status !== "initiated") {
      return NextResponse.json({ error: "Order is not in a resumable state" }, { status: 409 });
    }

    if (!order.razorpay_order_id) {
      return NextResponse.json({ error: "Payment session unavailable" }, { status: 500 });
    }

    logSecurityEvent("resume_checkout_initiated", {
      orderId: order.id,
      ip,
    });

    return NextResponse.json({
      order_id: order.id,
      razorpay_order_id: order.razorpay_order_id,
      amount: order.total_amount,
      currency: order.currency || "INR",
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/resume-checkout",
    });
  }
}
