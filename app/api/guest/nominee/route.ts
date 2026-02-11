import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { z } from "zod";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError, getFirstZodError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";
import { sanitizeObject } from "@/lib/xss";
import {
  appointNominee,
  getNomineeByPrincipal,
  revokeNominee,
} from "@/lib/nominee";
import {
  sendNomineeAppointed,
  sendNomineeNotification,
  sendNomineeRevoked,
  sendNomineeRevocationNotice,
} from "@/lib/email";

const appointSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  sessionToken: z.string().min(1, "Session token required").max(100).trim(),
  nomineeEmail: z.email({ message: "Invalid nominee email address" }),
  nomineeOtp: z.string().length(6, "OTP must be 6 digits"),
  nomineeName: z.string().min(1).max(100, "Name must be under 100 characters").trim(),
  relationship: z.enum(
    ["spouse", "child", "parent", "sibling", "legal_guardian", "other"],
    { message: "Invalid relationship type" }
  ),
});

const revokeSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  sessionToken: z.string().min(1, "Session token required").max(100).trim(),
});

/**
 * Verify OTP session for an email. Shared helper for this route.
 */
async function verifySession(
  supabase: ReturnType<typeof createServiceClient>,
  email: string,
  sessionToken: string
) {
  const { data: session, error } = await supabase
    .from("guest_data_sessions")
    .select("id, session_token, session_expires_at")
    .eq("email", email)
    .eq("session_token", sessionToken)
    .single();

  if (error || !session) return null;
  if (new Date(session.session_expires_at) < new Date()) return null;
  return session;
}

/**
 * POST /api/guest/nominee
 *
 * Appoint a nominee. Requires:
 * - Principal's active OTP session
 * - Nominee's OTP (sent via /api/guest/nominee/send-otp)
 * DPDP Rule 14
 */
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`guest-nominee:${ip}`);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parseResult = appointSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: getFirstZodError(parseResult.error), details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const sanitizedData = sanitizeObject(parseResult.data);
    const {
      email,
      sessionToken,
      nomineeEmail,
      nomineeOtp,
      nomineeName,
      relationship,
    } = sanitizedData;
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedNomineeEmail = nomineeEmail.toLowerCase().trim();

    const supabase = createServiceClient();

    // Verify principal's session
    const principalSession = await verifySession(
      supabase,
      normalizedEmail,
      sessionToken
    );
    if (!principalSession) {
      logSecurityEvent("nominee_appoint_invalid_session", {
        email: normalizedEmail,
        ip,
      });
      return NextResponse.json(
        {
          error:
            "Invalid or expired session. Please verify your email again.",
        },
        { status: 401 }
      );
    }

    // Verify principal has at least one confirmed order
    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("guest_email", normalizedEmail)
      .neq("order_status", "CHECKED_OUT")
      .limit(1);

    if (!orders || orders.length === 0) {
      return NextResponse.json(
        {
          error:
            "You must have at least one confirmed order to appoint a nominee.",
        },
        { status: 400 }
      );
    }

    // Verify nominee OTP
    const { data: nomineeSession, error: nomineeSessionError } = await supabase
      .from("guest_data_sessions")
      .select("id, otp_code, otp_expires_at, otp_attempts, otp_locked_until")
      .eq("email", normalizedNomineeEmail)
      .single();

    if (nomineeSessionError || !nomineeSession) {
      return NextResponse.json(
        {
          error:
            "Please send an OTP to the nominee email first.",
        },
        { status: 400 }
      );
    }

    // Check lockout
    if (
      nomineeSession.otp_locked_until &&
      new Date(nomineeSession.otp_locked_until) > new Date()
    ) {
      return NextResponse.json(
        {
          error: "Too many failed attempts. Please try again later.",
          lockedUntil: nomineeSession.otp_locked_until,
        },
        { status: 429 }
      );
    }

    // Check expiry
    if (
      !nomineeSession.otp_code ||
      !nomineeSession.otp_expires_at ||
      new Date(nomineeSession.otp_expires_at) < new Date()
    ) {
      return NextResponse.json(
        { error: "OTP has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Verify OTP
    if (nomineeSession.otp_code !== nomineeOtp) {
      const newAttempts = (nomineeSession.otp_attempts || 0) + 1;
      const updateData: Record<string, unknown> = {
        otp_attempts: newAttempts,
        updated_at: new Date().toISOString(),
      };

      if (newAttempts >= 5) {
        updateData.otp_locked_until = new Date(
          Date.now() + 30 * 60 * 1000
        ).toISOString();
        updateData.otp_code = null;
        updateData.otp_expires_at = null;
      }

      await supabase
        .from("guest_data_sessions")
        .update(updateData)
        .eq("id", nomineeSession.id);

      return NextResponse.json(
        {
          error: "Invalid OTP.",
          attemptsRemaining: Math.max(0, 5 - newAttempts),
        },
        { status: 400 }
      );
    }

    // OTP valid — clear it
    await supabase
      .from("guest_data_sessions")
      .update({
        otp_code: null,
        otp_expires_at: null,
        otp_attempts: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", nomineeSession.id);

    // Appoint nominee
    const userAgent = req.headers.get("user-agent") || undefined;
    const result = await appointNominee({
      principalEmail: normalizedEmail,
      nomineeName,
      nomineeEmail: normalizedNomineeEmail,
      relationship,
      ip,
      userAgent,
    });

    // Send emails (non-blocking)
    sendNomineeAppointed({
      principalEmail: normalizedEmail,
      nomineeName,
      nomineeEmail: normalizedNomineeEmail,
      relationship,
    }).catch((err) => console.error("Failed to send nominee appointed email:", err));

    sendNomineeNotification({
      nomineeEmail: normalizedNomineeEmail,
      nomineeName,
      principalEmail: normalizedEmail,
      relationship,
    }).catch((err) => console.error("Failed to send nominee notification email:", err));

    return NextResponse.json({
      success: true,
      message: "Nominee appointed successfully.",
      nomineeId: result.nomineeId,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("already have an active nominee") ||
        error.message.includes("must be different"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return handleApiError(error, { endpoint: "/api/guest/nominee" });
  }
}

/**
 * GET /api/guest/nominee?email=...&sessionToken=...
 *
 * View the current active nominee for a verified principal.
 */
export async function GET(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`guest-nominee-get:${ip}`);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const url = new URL(req.url);
    const email = url.searchParams.get("email");
    const sessionToken = url.searchParams.get("sessionToken");

    if (!email || !sessionToken) {
      return NextResponse.json(
        { error: "Email and session token are required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const supabase = createServiceClient();

    const session = await verifySession(
      supabase,
      normalizedEmail,
      sessionToken
    );
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 }
      );
    }

    const nominee = await getNomineeByPrincipal(normalizedEmail);

    return NextResponse.json({
      success: true,
      nominee: nominee
        ? {
          id: nominee.id,
          nomineeName: nominee.nominee_name,
          nomineeEmail: nominee.nominee_email,
          relationship: nominee.relationship,
          createdAt: nominee.created_at,
        }
        : null,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/guest/nominee" });
  }
}

/**
 * DELETE /api/guest/nominee
 *
 * Revoke the current active nominee.
 */
export async function DELETE(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`guest-nominee-del:${ip}`);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parseResult = revokeSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: getFirstZodError(parseResult.error), details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const sanitizedData = sanitizeObject(parseResult.data);
    const { email, sessionToken } = sanitizedData;
    const normalizedEmail = email.toLowerCase().trim();

    const supabase = createServiceClient();

    const session = await verifySession(
      supabase,
      normalizedEmail,
      sessionToken
    );
    if (!session) {
      logSecurityEvent("nominee_revoke_invalid_session", {
        email: normalizedEmail,
        ip,
      });
      return NextResponse.json(
        { error: "Invalid or expired session. Please verify your email again." },
        { status: 401 }
      );
    }

    const result = await revokeNominee(normalizedEmail, ip);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    // Send emails (non-blocking)
    if (result.nominee) {
      sendNomineeRevoked({
        principalEmail: normalizedEmail,
        nomineeName: result.nominee.nominee_name,
      }).catch((err) => console.error("Failed to send nominee revoked email:", err));

      sendNomineeRevocationNotice({
        nomineeEmail: result.nominee.nominee_email,
        nomineeName: result.nominee.nominee_name,
        principalEmail: normalizedEmail,
      }).catch((err) => console.error("Failed to send nominee revocation notice:", err));
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/guest/nominee" });
  }
}
