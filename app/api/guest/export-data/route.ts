import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { z } from "zod";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";
import { buildPrincipalDataExport } from "@/lib/data-export";

const requestSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  sessionToken: z.string().min(1, "Session token required"),
});

/**
 * POST /api/guest/export-data
 *
 * Exports all data for a verified guest email in JSON format
 * DPDP Act - Right to Data Portability
 */
export async function POST(req: Request) {
  try {
    // Rate limiting - 3 exports per hour
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`guest-export:${ip}`);

    if (!success) {
      return NextResponse.json(
        { error: "Too many export requests. Please try again later." },
        { status: 429 }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const { email, sessionToken } = requestSchema.parse(body);
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
      logSecurityEvent("guest_export_invalid_session", {
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

    const { jsonString, filename, ordersCount } =
      await buildPrincipalDataExport(normalizedEmail);

    await logDataAccess({
      tableName: "orders",
      operation: "SELECT",
      ip,
      queryType: "export",
      rowCount: ordersCount,
      endpoint: "/api/guest/export-data",
      reason: "DPDP data portability request",
    });

    logSecurityEvent("guest_data_exported", {
      email: normalizedEmail,
      ip,
      ordersCount,
    });

    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/export-data",
    });
  }
}
