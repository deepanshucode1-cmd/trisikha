import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import crypto from "crypto";
import { z } from "zod";
import { otpRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";
import { sanitizeObject } from "@/lib/xss";
import { sendEmail } from "@/lib/email";

const requestSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  sessionToken: z.string().min(1, "Session token required"),
  nomineeEmail: z.email({ message: "Invalid nominee email address" }),
});

/**
 * POST /api/guest/nominee/send-otp
 *
 * Send OTP to nominee's email for appointment verification.
 * Requires the principal's active session token.
 * DPDP Rule 14 — Nominee Appointment
 */
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = await otpRateLimit.limit(`nominee-otp:${ip}`);

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
        { error: "Invalid request", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const sanitizedData = sanitizeObject(parseResult.data);
    const { email, sessionToken, nomineeEmail } = sanitizedData;
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedNomineeEmail = nomineeEmail.toLowerCase().trim();

    if (normalizedEmail === normalizedNomineeEmail) {
      return NextResponse.json(
        { error: "Nominee email must be different from your email." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Verify principal's session
    const { data: session, error: sessionError } = await supabase
      .from("guest_data_sessions")
      .select("id, session_token, session_expires_at")
      .eq("email", normalizedEmail)
      .eq("session_token", sessionToken)
      .single();

    if (sessionError || !session) {
      logSecurityEvent("nominee_send_otp_invalid_session", {
        email: normalizedEmail,
        ip,
      });
      return NextResponse.json(
        { error: "Invalid or expired session. Please verify your email again." },
        { status: 401 }
      );
    }

    if (new Date(session.session_expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Session has expired. Please verify your email again." },
        { status: 401 }
      );
    }

    // Generate OTP for nominee email
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP in guest_data_sessions for nominee email
    const { error: upsertError } = await supabase
      .from("guest_data_sessions")
      .upsert(
        {
          email: normalizedNomineeEmail,
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

    // Send OTP to nominee's email
    await sendEmail({
      to: normalizedNomineeEmail,
      subject: "TrishikhaOrganics: Nominee Appointment Verification",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #166534;">Nominee Appointment Verification</h2>
          <p>Hi,</p>
          <p>Someone with the email <strong>${normalizedEmail}</strong> is appointing you as their <strong>data nominee</strong> at Trishikha Organics.</p>
          <p>As a nominee, you would be able to request export or deletion of their data in the event of their death or incapacity, as per the DPDP Act 2023, Rule 14.</p>
          <p>To confirm this appointment, share this OTP with the person appointing you:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${otp}
          </div>
          <p>This OTP is valid for <strong>10 minutes</strong>.</p>
          <p>If you did not expect this, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 12px;">
            This is an automated message from Trishikha Organics.<br>
            Thank you for shopping with Trishikha Organics.
          </p>
        </div>
      `,
      text: `Hi,\n\nSomeone with the email ${normalizedEmail} is appointing you as their data nominee at Trishikha Organics.\n\nAs a nominee, you would be able to request export or deletion of their data in the event of their death or incapacity (DPDP Act 2023, Rule 14).\n\nTo confirm, share this OTP: ${otp}\n\nThis OTP is valid for 10 minutes.\n\nIf you did not expect this, please ignore this email.\n\nTrishikha Organics`,
    });

    logSecurityEvent("nominee_otp_sent", {
      principalEmail: normalizedEmail,
      nomineeEmail: normalizedNomineeEmail,
      ip,
      expiresAt: expiresAt.toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "OTP sent to nominee email.",
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/nominee/send-otp",
    });
  }
}
