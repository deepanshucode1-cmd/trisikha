import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { otpRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { trackSecurityEvent, logSecurityEvent } from "@/lib/logger";

const requestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

/**
 * POST /api/guest/send-data-otp
 *
 * Sends OTP to guest email for data access/export/deletion
 * DPDP Act compliance - allows guests to access their data
 */
export async function POST(req: Request) {
  try {
    // Rate limiting - 5 OTP requests per hour per IP
    const ip = getClientIp(req);
    const { success, limit, reset, remaining } = await otpRateLimit.limit(`data-otp:${ip}`);

    if (!success) {
      await trackSecurityEvent("rate_limit_exceeded", {
        endpoint: "/api/guest/send-data-otp",
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
    const { email } = requestSchema.parse(body);
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email has any orders
    const supabase = createServiceClient();
    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("id")
      .eq("guest_email", normalizedEmail)
      .limit(1);

    if (orderError) {
      throw new Error("Failed to check orders");
    }

    if (!orders || orders.length === 0) {
      // Don't reveal if email exists or not for security
      // Still send a "success" response but don't actually send OTP
      logSecurityEvent("data_otp_no_orders", {
        email: normalizedEmail,
        ip,
      });

      return NextResponse.json({
        success: true,
        message: "If orders exist for this email, an OTP has been sent.",
      });
    }

    // Generate secure OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP in guest_data_sessions table (upsert by email)
    const { error: upsertError } = await supabase
      .from("guest_data_sessions")
      .upsert(
        {
          email: normalizedEmail,
          otp_code: otp,
          otp_expires_at: expiresAt.toISOString(),
          otp_attempts: 0,
          otp_locked_until: null,
          session_token: null,
          session_expires_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      );

    if (upsertError) {
      throw new Error("Failed to store OTP");
    }

    // Send OTP via email
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
      to: normalizedEmail,
      subject: "TrishikhaOrganics: Your OTP for Data Access",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Data Access Request</h2>
          <p>Hi,</p>
          <p>You requested to access your data at Trishikha Organics. Your OTP is:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${otp}
          </div>
          <p>This OTP is valid for <strong>10 minutes</strong>.</p>
          <p>With this verification, you can:</p>
          <ul>
            <li>View all orders associated with your email</li>
            <li>Download your data in JSON format</li>
            <li>Request deletion of your personal data</li>
          </ul>
          <p>If you did not request this, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 12px;">
            This is part of our commitment to DPDP Act compliance.<br>
            Thank you,<br>TrishikhaOrganics Team
          </p>
        </div>
      `,
      text: `Hi,\n\nYou requested to access your data at Trishikha Organics. Your OTP is: ${otp}. It is valid for 10 minutes.\n\nWith this verification, you can view orders, download data, and request deletion.\n\nIf you did not request this, please ignore this email.\n\nThank you,\nTrishikhaOrganics Team`,
    });

    logSecurityEvent("data_otp_sent", {
      email: normalizedEmail,
      ip,
      expiresAt: expiresAt.toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "If orders exist for this email, an OTP has been sent.",
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/send-data-otp",
    });
  }
}
