import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { z } from "zod";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError, getFirstZodError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";
import { createGrievance, getGrievancesByEmail } from "@/lib/grievance";
import { sanitizeObject } from "@/lib/xss";
import { sendGrievanceReceived } from "@/lib/email";

const grievanceSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  sessionToken: z.string().min(1, "Session token required").max(100).trim(),
  subject: z
    .string()
    .min(5, "Subject must be at least 5 characters")
    .max(200, "Subject must be at most 200 characters")
    .trim(),
  description: z
    .string()
    .min(20, "Description must be at least 20 characters")
    .max(2000, "Description must be at most 2000 characters")
    .trim(),
  category: z.enum(
    ["data_processing", "correction", "deletion", "consent", "breach", "other"],
    { message: "Invalid grievance category" }
  ),
});

/**
 * POST /api/guest/grievance
 *
 * Submit a grievance
 * DPDP Rules 2025 Rule 14(3) - Grievance Redressal
 *
 * Requires email verification via session token + confirmed orders
 */
export async function POST(req: Request) {
  try {
    // Rate limiting - 3 grievances per hour
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`guest-grievance:${ip}`);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const parseResult = grievanceSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: getFirstZodError(parseResult.error), details: z.flattenError(parseResult.error) },
        { status: 400 }
      );
    }

    const sanitizedData = sanitizeObject(parseResult.data);
    const { email, sessionToken, subject, description, category } =
      sanitizedData;
    const normalizedEmail = email.toLowerCase().trim();

    const supabase = createServiceClient();

    // Verify session token from guest_data_sessions
    const { data: session, error: sessionError } = await supabase
      .from("guest_data_sessions")
      .select("id, session_token, session_expires_at")
      .eq("email", normalizedEmail)
      .eq("session_token", sessionToken)
      .single();

    if (sessionError || !session) {
      logSecurityEvent("guest_grievance_invalid_session", {
        email: normalizedEmail,
        ip,
      });

      return NextResponse.json(
        { error: "Invalid or expired session. Please verify your email again." },
        { status: 401 }
      );
    }

    // Check if session has expired
    if (new Date(session.session_expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Session has expired. Please verify your email again." },
        { status: 401 }
      );
    }

    // Verify email has confirmed/paid orders (prevents abuse from non-customers)
    const { count, error: orderError } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("guest_email", normalizedEmail)
      .neq("order_status", "CHECKED_OUT");

    if (orderError) {
      return NextResponse.json(
        { error: "Failed to verify order history." },
        { status: 500 }
      );
    }

    if (!count || count === 0) {
      return NextResponse.json(
        {
          error:
            "Grievances can only be filed by customers with confirmed orders.",
        },
        { status: 403 }
      );
    }

    // Create the grievance
    const userAgent = req.headers.get("user-agent") || undefined;
    const result = await createGrievance({
      email: normalizedEmail,
      subject,
      description,
      category,
      ip,
      userAgent,
    });

    // Send confirmation email (non-blocking)
    sendGrievanceReceived({
      email: normalizedEmail,
      grievanceId: result.grievanceId,
      subject,
      slaDeadline: new Date(result.slaDeadline),
    }).catch(() => { });

    return NextResponse.json({
      success: true,
      grievanceId: result.grievanceId,
      slaDeadline: result.slaDeadline,
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/grievance",
    });
  }
}

/**
 * GET /api/guest/grievance?email=...&sessionToken=...
 *
 * Get grievance status for a verified guest
 */
export async function GET(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`guest-grievance-status:${ip}`);

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

    // Verify session
    const { data: session, error: sessionError } = await supabase
      .from("guest_data_sessions")
      .select("id, session_token, session_expires_at")
      .eq("email", normalizedEmail)
      .eq("session_token", sessionToken)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 }
      );
    }

    if (new Date(session.session_expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Session has expired. Please verify your email again." },
        { status: 401 }
      );
    }

    const grievances = await getGrievancesByEmail(normalizedEmail);

    return NextResponse.json({
      success: true,
      grievances: grievances.map((g) => ({
        id: g.id,
        subject: g.subject,
        description: g.description,
        category: g.category,
        status: g.status,
        priority: g.priority,
        slaDeadline: g.sla_deadline,
        resolutionNotes: g.resolution_notes,
        createdAt: g.created_at,
        resolvedAt: g.resolved_at,
      })),
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/grievance",
    });
  }
}
