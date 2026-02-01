import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { z } from "zod";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";
import {
  cancelDeletionRequest,
  getPendingDeletionRequest,
} from "@/lib/deletion-request";
import { sendDeletionCancelled } from "@/lib/email";

const requestSchema = z.object({
  email: z.string().email("Invalid email address"),
  otp: z.string().length(6, "OTP must be 6 digits"),
  confirmPhrase: z.literal("CANCEL DELETION", {
    message: "Please type 'CANCEL DELETION' to confirm",
  }),
});

const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * POST /api/guest/cancel-deletion
 *
 * Cancels a pending deletion request
 * Requires fresh OTP verification for security
 */
export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`cancel-deletion:${ip}`);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const parseResult = requestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { email, otp } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const supabase = createServiceClient();

    // Check if there's a pending deletion request
    const pendingRequest = await getPendingDeletionRequest(normalizedEmail);
    if (!pendingRequest) {
      return NextResponse.json(
        { error: "No pending deletion request found for this email." },
        { status: 404 }
      );
    }

    // Get the session data for this email from guest_data_sessions
    const { data: session, error: sessionError } = await supabase
      .from("guest_data_sessions")
      .select("id, otp_code, otp_expires_at, otp_attempts, otp_locked_until")
      .eq("email", normalizedEmail)
      .single();

    if (sessionError || !session || !session.otp_code) {
      logSecurityEvent("cancel_deletion_otp_invalid", {
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
      logSecurityEvent("cancel_deletion_otp_locked", {
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

        logSecurityEvent("cancel_deletion_otp_brute_force", {
          email: normalizedEmail,
          ip,
          attempts: newAttempts,
        });

        return NextResponse.json(
          {
            error: "Too many failed attempts. Account locked for 30 minutes.",
            lockedUntil: lockUntil.toISOString(),
          },
          { status: 429 }
        );
      }

      await supabase
        .from("guest_data_sessions")
        .update({ otp_attempts: newAttempts })
        .eq("id", session.id);

      return NextResponse.json(
        {
          error: "Invalid OTP. Please try again.",
          attemptsRemaining: MAX_OTP_ATTEMPTS - newAttempts,
        },
        { status: 400 }
      );
    }

    // OTP is valid - clear it
    await supabase
      .from("guest_data_sessions")
      .update({
        otp_code: null,
        otp_expires_at: null,
        otp_attempts: 0,
        otp_locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    // Cancel the deletion request
    const result = await cancelDeletionRequest({
      email: normalizedEmail,
      reason: "User cancelled via OTP verification",
    });

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to cancel deletion request. Please try again." },
        { status: 500 }
      );
    }

    // Send cancellation confirmation email (non-blocking)
    sendDeletionCancelled({
      email: normalizedEmail,
      cancelledAt: result.cancelledAt!,
    }).catch((err) => {
      console.error("Failed to send deletion cancelled email:", err);
    });

    logSecurityEvent("deletion_request_cancelled_by_user", {
      email: normalizedEmail,
      ip,
      cancelledAt: result.cancelledAt?.toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Your deletion request has been cancelled.",
      cancelledAt: result.cancelledAt?.toISOString(),
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/cancel-deletion",
    });
  }
}
