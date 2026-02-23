import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { otpRequestSchema } from "@/lib/validation";
import { otpRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { logOrder, trackSecurityEvent, logSecurityEvent } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success, limit, reset, remaining } = await otpRateLimit.limit(ip);

    if (!success) {
      await trackSecurityEvent("rate_limit_exceeded", {
        endpoint: "/api/orders/send-cancel-otp",
        ip,
        limit,
      });

      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": new Date(reset).toISOString(),
          },
        }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const validatedData = otpRequestSchema.parse(body);
    const { orderId, email } = validatedData;

    // Get order from database with additional fields for return detection
    const supabase = createServiceClient();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, guest_email, otp_locked_until, order_status")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      logSecurityEvent("otp_request_invalid_order", {
        orderId,
        email,
        ip,
      });
      // Generic error — don't reveal whether order exists
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify email matches the order — return same generic error to prevent oracle
    if (order.guest_email !== email) {
      logSecurityEvent("otp_request_email_mismatch", {
        orderId,
        providedEmail: email,
        ip,
      });
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Check if order is locked due to too many failed attempts
    if (order.otp_locked_until && new Date(order.otp_locked_until) > new Date()) {
      logSecurityEvent("otp_request_account_locked", {
        orderId,
        lockedUntil: order.otp_locked_until,
        ip,
      });

      return NextResponse.json(
        { error: "Too many failed attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Detect if this is a return request
    const isReturn = order.order_status === "PICKED_UP" || order.order_status === "DELIVERED";

    // Generate secure OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update order with OTP and reset attempts
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        cancellation_status: "OTP_SENT",
        otp_code: otp,
        otp_expires_at: expiresAt.toISOString(),
        otp_attempts: 0,
        otp_locked_until: null,
      })
      .eq("id", orderId);

    if (updateError) {
      throw new Error("Failed to update order with OTP");
    }

    // Send OTP via email (different content for returns vs cancellations)
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    if (isReturn) {
      // Return-specific email — no financial data, direct to return policy
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "TrishikhaOrganics: Your OTP for Order Return",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Order Return Request</h2>
            <p>Hi,</p>
            <p>Your OTP for returning order <strong>${orderId}</strong> is:</p>
            <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
              ${otp}
            </div>
            <p>This OTP is valid for <strong>10 minutes</strong>.</p>
            <p style="color: #666;">Please review our <a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://trishikhaorganic.com"}/return-policy">return policy</a> for details on refund calculations and shipping deductions.</p>
            <p>If you did not request this, please ignore this email.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #888; font-size: 12px;">Thank you,<br>TrishikhaOrganics Team</p>
          </div>
        `,
        text: `Hi,\n\nYour OTP for returning order ${orderId} is: ${otp}. It is valid for 10 minutes.\n\nPlease review our return policy for details on refund calculations and shipping deductions.\n\nIf you did not request this, please ignore this email.\n\nThank you,\nTrishikhaOrganics Team`,
      });
    } else {
      // Cancellation email (original)
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "TrishikhaOrganics: Your OTP for Order Cancellation",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Order Cancellation Request</h2>
            <p>Hi,</p>
            <p>Your OTP for cancelling order <strong>${orderId}</strong> is:</p>
            <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
              ${otp}
            </div>
            <p>This OTP is valid for <strong>10 minutes</strong>.</p>
            <p>If you did not request this, please ignore this email.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #888; font-size: 12px;">Thank you,<br>TrishikhaOrganics Team</p>
          </div>
        `,
        text: `Hi,\n\nYour OTP for cancelling order ${orderId} is: ${otp}. It is valid for 10 minutes.\n\nIf you did not request this, please ignore this email.\n\nThank you,\nTrishikhaOrganics Team`,
      });
    }

    logOrder("otp_sent", {
      orderId,
      email: email,
      expiresAt: expiresAt.toISOString(),
      isReturn,
    });

    return NextResponse.json({
      success: true,
      expiresAt: expiresAt.toISOString(),
      isReturn: isReturn || undefined,
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/orders/send-cancel-otp",
    });
  }
}
