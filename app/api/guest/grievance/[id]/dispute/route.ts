import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { z } from "zod";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError, getFirstZodError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";
import { postUserDispute, getGrievanceById } from "@/lib/grievance";
import { sanitizeObject } from "@/lib/xss";
import { sendGrievanceDisputeReceived } from "@/lib/email";

const disputeSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  sessionToken: z.string().min(1).max(100).trim(),
  body: z
    .string()
    .min(10, "Please write at least 10 characters explaining your concern")
    .max(2000, "Please keep your message under 2000 characters")
    .trim(),
});

/**
 * POST /api/guest/grievance/[id]/dispute
 *
 * User disputes admin's closure proposal (T6).
 * Requires OTP-verified session + email match against grievance.email.
 * Inserts the user's message in the thread and transitions the grievance
 * back to `in_progress`.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIp(req);
    // Same per-IP rate limit as the new-grievance endpoint — 3/hour. Per
    // the plan §3.3, dispute thrash is the spam vector to defend against.
    const { success } = await apiRateLimit.limit(`guest-grievance-dispute:${ip}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { id: grievanceId } = await params;

    const body = await req.json();
    const parseResult = disputeSchema.safeParse(body);

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
      logSecurityEvent("guest_grievance_dispute_invalid_session", {
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
      logSecurityEvent("guest_grievance_dispute_email_mismatch", {
        email: normalizedEmail,
        grievanceId,
        ip,
      });
      return NextResponse.json(
        { error: "Grievance not found" },
        { status: 404 }
      );
    }

    const result = await postUserDispute({
      grievanceId,
      body: sanitized.body,
    });
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 409 });
    }

    sendGrievanceDisputeReceived({
      grievanceId,
      userEmail: normalizedEmail,
      subject: grievance.subject,
      disputeBody: sanitized.body,
    }).catch(() => {});

    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/grievance/[id]/dispute",
    });
  }
}
