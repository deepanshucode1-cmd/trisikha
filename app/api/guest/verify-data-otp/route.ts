import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { z } from "zod";
import { otpRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { trackSecurityEvent, logSecurityEvent } from "@/lib/logger";
import crypto from "crypto";

const verifySchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * POST /api/guest/verify-data-otp
 *
 * Verifies OTP and returns a session token for data access
 */
export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success } = await otpRateLimit.limit(`verify-data-otp:${ip}`);

    if (false) {
      await trackSecurityEvent("rate_limit_exceeded", {
        endpoint: "/api/guest/verify-data-otp",
        ip,
      });

      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const { email, otp } = verifySchema.parse(body);
    const normalizedEmail = email.toLowerCase().trim();

    const supabase = createServiceClient();

    // Get the session data for this email from guest_data_sessions
    const { data: session, error: sessionError } = await supabase
      .from("guest_data_sessions")
      .select("id, otp_code, otp_expires_at, otp_attempts, otp_locked_until")
      .eq("email", normalizedEmail)
      .single();

    if (sessionError || !session || !session.otp_code) {
      logSecurityEvent("data_otp_verify_invalid", {
        email: normalizedEmail,
        ip,
        reason: "no_otp_found",
      });

      return NextResponse.json(
        { error: "Invalid or expired OTP. Please request a new one." },
        { status: 400 }
      );
    }

    // Check if account is locked
    if (session.otp_locked_until && new Date(session.otp_locked_until) > new Date()) {
      logSecurityEvent("data_otp_verify_locked", {
        email: normalizedEmail,
        ip,
        lockedUntil: session.otp_locked_until,
      });

      return NextResponse.json(
        {
          error: "Too many failed attempts. Please try again later.",
          lockedUntil: session.otp_locked_until,
        },
        { status: 429 }
      );
    }

    // Check if OTP has expired
    if (new Date(session.otp_expires_at) < new Date()) {
      // Clear expired OTP
      await supabase
        .from("guest_data_sessions")
        .update({ otp_code: null, otp_expires_at: null })
        .eq("id", session.id);

      return NextResponse.json(
        { error: "OTP has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Verify OTP
    if (session.otp_code !== otp) {
      const newAttempts = (session.otp_attempts || 0) + 1;

      // Check if should lock
      if (newAttempts >= MAX_OTP_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);

        await supabase
          .from("guest_data_sessions")
          .update({
            otp_attempts: newAttempts,
            otp_locked_until: lockUntil.toISOString(),
            otp_code: null,
            otp_expires_at: null,
          })
          .eq("id", session.id);

        await trackSecurityEvent("otp_brute_force", {
          email: normalizedEmail,
          ip,
          attempts: newAttempts,
          lockedUntil: lockUntil.toISOString(),
          endpoint: "/api/guest/verify-data-otp",
        });

        return NextResponse.json(
          {
            error: "Too many failed attempts. Account locked for 30 minutes.",
            lockedUntil: lockUntil.toISOString(),
          },
          { status: 429 }
        );
      }

      // Increment attempts
      await supabase
        .from("guest_data_sessions")
        .update({ otp_attempts: newAttempts })
        .eq("id", session.id);

      logSecurityEvent("data_otp_verify_failed", {
        email: normalizedEmail,
        ip,
        attempts: newAttempts,
      });

      return NextResponse.json(
        {
          error: "Invalid OTP. Please try again.",
          attemptsRemaining: MAX_OTP_ATTEMPTS - newAttempts,
        },
        { status: 400 }
      );
    }

    // OTP is valid - generate a session token
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store session token
    await supabase
      .from("guest_data_sessions")
      .update({
        otp_code: null,
        otp_expires_at: null,
        otp_attempts: 0,
        otp_locked_until: null,
        session_token: sessionToken,
        session_expires_at: tokenExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    logSecurityEvent("data_otp_verified", {
      email: normalizedEmail,
      ip,
    });

    return NextResponse.json({
      success: true,
      sessionToken,
      expiresAt: tokenExpiry.toISOString(),
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/verify-data-otp",
    });
  }
}
