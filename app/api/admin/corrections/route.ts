import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logError } from "@/lib/logger";
import {
  getCorrectionRequests,
  getCorrectionRequestStats,
  type CorrectionStatus,
} from "@/lib/correction-request";

/**
 * GET /api/admin/corrections
 *
 * List all correction requests with optional filters
 * Query params: status, email, limit, offset
 */
export async function GET(req: Request) {
  try {
    const supabase = await createClient();

    // Check admin authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    const { data: userRole } = await supabase
      .from("user_role")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userRole || !["admin", "super_admin"].includes(userRole.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse query params
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as CorrectionStatus | null;
    const email = url.searchParams.get("email") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Get correction requests
    const { requests, total } = await getCorrectionRequests({
      status: status || undefined,
      email,
      limit,
      offset,
    });

    // Get stats
    const stats = await getCorrectionRequestStats();

    return NextResponse.json({
      success: true,
      requests,
      total,
      limit,
      offset,
      stats,
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_get_correction_requests_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
