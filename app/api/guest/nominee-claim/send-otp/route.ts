import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import crypto from "crypto";
import { z } from "zod";
import { otpRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError, getFirstZodError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";
import { sanitizeObject } from "@/lib/xss";
import { findActiveNomination } from "@/lib/nominee";
import { sendEmail } from "@/lib/email";

const requestSchema = z.object({
  nomineeEmail: z.email({ message: "Invalid nominee email address" }),
  principalEmail: z.email({ message: "Invalid principal email address" }),
});

/**
 * POST /api/guest/nominee-claim/send-otp
 *
 * Send OTP to nominee email for claim submission.
 * Public endpoint — nominee initiates the flow.
 * Returns a generic response regardless of whether a nomination exists
 * to prevent enumeration of principal-nominee pairs.
 */
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = await otpRateLimit.limit(`nominee-claim-otp:${ip}`);

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
        { error: getFirstZodError(parseResult.error), details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const sanitizedData = sanitizeObject(parseResult.data);
    const { nomineeEmail, principalEmail } = sanitizedData;
    const normalizedNomineeEmail = nomineeEmail.toLowerCase().trim();
    const normalizedPrincipalEmail = principalEmail.toLowerCase().trim();

    // Generic response used for both found and not-found cases
    const genericResponse = {
      success: true,
      message:
        "If a valid nomination exists, an OTP has been sent to the nominee email.",
    };

    // Check if nomination exists (silently)
    const nomination = await findActiveNomination(
      normalizedPrincipalEmail,
      normalizedNomineeEmail
    );

    if (!nomination) {
      // Log but don't reveal to the caller
      logSecurityEvent("nominee_claim_otp_no_nomination", {
        nomineeEmail: normalizedNomineeEmail,
        principalEmail: normalizedPrincipalEmail,
        ip,
      });
      return NextResponse.json(genericResponse);
    }

    // Nomination exists — generate and send OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const supabase = createServiceClient();

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

    await sendEmail({
      to: normalizedNomineeEmail,
      subject: "TrishikhaOrganics: Nominee Claim Verification",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a365d;">Nominee Claim Verification</h2>
          <p>Hi,</p>
          <p>You are submitting a nominee claim at Trishikha Organics. Your OTP is:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${otp}
          </div>
          <p>This OTP is valid for <strong>10 minutes</strong>.</p>
          <p>If you did not request this, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 12px;">
            This is an automated message from Trishikha Organics.<br>
            Thank you for shopping with Trishikha Organics.
          </p>
        </div>
      `,
      text: `Hi,\n\nYou are submitting a nominee claim at Trishikha Organics.\n\nYour OTP: ${otp}\n\nThis OTP is valid for 10 minutes.\n\nIf you did not request this, please ignore this email.\n\nTrishikha Organics`,
    });

    logSecurityEvent("nominee_claim_otp_sent", {
      nomineeEmail: normalizedNomineeEmail,
      principalEmail: normalizedPrincipalEmail,
      ip,
      expiresAt: expiresAt.toISOString(),
    });

    return NextResponse.json(genericResponse);
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/nominee-claim/send-otp",
    });
  }
}
