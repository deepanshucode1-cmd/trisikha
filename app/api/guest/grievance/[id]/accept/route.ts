import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { z } from "zod";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError, getFirstZodError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";
import { acceptResolution, getGrievanceById } from "@/lib/grievance";
import { sanitizeObject } from "@/lib/xss";
import { sendGrievanceAccepted } from "@/lib/email";

const acceptSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  sessionToken: z.string().min(1).max(100).trim(),
});

/**
 * POST /api/guest/grievance/[id]/accept
 *
 * User accepts admin's closure proposal (T5).
 * Requires OTP-verified session + email match against grievance.email.
 * Body is silent by design — see lib/grievance.ts acceptResolution.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`guest-grievance-accept:${ip}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { id: grievanceId } = await params;

    const body = await req.json();
    const parseResult = acceptSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: getFirstZodError(parseResult.error),
          details: z.flattenError(parseResult.error),
        },
        { status: 400 }
      );
    }

    const sanitized = sanitizeObject(parseResult.data);
    const normalizedEmail = sanitized.email.toLowerCase().trim();

    const supabase = createServiceClient();

    const { data: session, error: sessionError } = await supabase
      .from("guest_data_sessions")
      .select("id, session_token, session_expires_at")
      .eq("email", normalizedEmail)
      .eq("session_token", sanitized.sessionToken)
      .single();

    if (sessionError || !session) {
      logSecurityEvent("guest_grievance_accept_invalid_session", {
        email: normalizedEmail,
        grievanceId,
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

    const grievance = await getGrievanceById(grievanceId);
    if (!grievance) {
      return NextResponse.json(
        { error: "Grievance not found" },
        { status: 404 }
      );
    }

    if (grievance.email !== normalizedEmail) {
      // Don't leak existence of the grievance to a different verified user.
      logSecurityEvent("guest_grievance_accept_email_mismatch", {
        email: normalizedEmail,
        grievanceId,
        ip,
      });
      return NextResponse.json(
        { error: "Grievance not found" },
        { status: 404 }
      );
    }

    const result = await acceptResolution({ grievanceId });
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 409 });
    }

    sendGrievanceAccepted({
      grievanceId,
      userEmail: normalizedEmail,
      subject: grievance.subject,
    }).catch(() => {});

    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/grievance/[id]/accept",
    });
  }
}
