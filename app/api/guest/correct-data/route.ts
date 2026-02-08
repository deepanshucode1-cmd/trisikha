import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { z } from "zod";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";
import {
  createCorrectionRequest,
  getCorrectionRequestsByEmail,
} from "@/lib/correction-request";
import { sanitizeObject } from "@/lib/xss";

const correctionSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  sessionToken: z.string().min(1, "Session token required"),
  fieldName: z.enum(["name", "phone", "address"], {
    message: "Field must be one of: name, phone, address",
  }),
  currentValue: z.string().min(1, "Current value is required"),
  requestedValue: z.string().min(1, "Requested value is required"),
  orderId: z.uuid({ message: "Invalid order ID" }),
});

/**
 * POST /api/guest/correct-data
 *
 * Submit a data correction request
 * DPDP Rule 14 - Right to Correction
 *
 * Requires email verification via session token
 */
export async function POST(req: Request) {
  try {
    // Rate limiting - 5 correction requests per hour
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`guest-correct:${ip}`);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const parseResult = correctionSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const sanitizedData = sanitizeObject(parseResult.data);
    const { email, sessionToken, fieldName, currentValue, requestedValue, orderId } =
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
      logSecurityEvent("guest_correct_invalid_session", {
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

    // Verify order belongs to this email and has CONFIRMED status + NOT_SHIPPED
    const { data: order } = await supabase
      .from("orders")
      .select("id, order_status, shiprocket_status")
      .eq("id", orderId)
      .eq("guest_email", normalizedEmail)
      .single();

    if (!order) {
      return NextResponse.json(
        { error: "Order not found or does not belong to this email." },
        { status: 404 }
      );
    }

    if (order.order_status !== "CONFIRMED") {
      return NextResponse.json(
        {
          error: "Corrections are only allowed for orders with status CONFIRMED.",
          currentStatus: order.order_status,
        },
        { status: 400 }
      );
    }

    if (order.shiprocket_status !== "NOT_SHIPPED") {
      return NextResponse.json(
        {
          error:
            "This order has entered the shipping pipeline and cannot be corrected online. " +
            "Please contact our Grievance Officer at trishikhaorganic@gmail.com or +91 79841 30253 " +
            "for manual correction (DPDP Act 2023, Rule 14).",
          currentShippingStatus: order.shiprocket_status,
        },
        { status: 400 }
      );
    }

    // Validate that the values are actually different
    if (currentValue === requestedValue) {
      return NextResponse.json(
        { error: "The corrected value must be different from the current value." },
        { status: 400 }
      );
    }

    // Create the correction request
    const userAgent = req.headers.get("user-agent") || undefined;
    const result = await createCorrectionRequest({
      email: normalizedEmail,
      orderId,
      fieldName,
      currentValue,
      requestedValue,
      ip,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      message: "Your correction has been applied successfully.",
      details: {
        requestId: result.requestId,
        fieldName,
        orderId,
        status: "approved",
      },
    });
  } catch (error) {
    // Handle duplicate / validation errors gracefully
    if (error instanceof Error && (
      error.message.includes("already been submitted") ||
      error.message.includes("only allowed for orders") ||
      error.message.includes("must be different from")
    )) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    return handleApiError(error, {
      endpoint: "/api/guest/correct-data",
    });
  }
}

/**
 * GET /api/guest/correct-data?email=...&sessionToken=...
 *
 * Get correction request status for a verified guest
 */
export async function GET(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`guest-correct-status:${ip}`);

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

    const requests = await getCorrectionRequestsByEmail(normalizedEmail);

    return NextResponse.json({
      success: true,
      requests: requests.map((r) => ({
        id: r.id,
        orderId: r.order_id,
        fieldName: r.field_name,
        currentValue: r.current_value,
        requestedValue: r.requested_value,
        status: r.status,
        adminNotes: r.admin_notes,
        createdAt: r.created_at,
        processedAt: r.processed_at,
      })),
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/correct-data",
    });
  }
}
