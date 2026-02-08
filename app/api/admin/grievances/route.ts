import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logError } from "@/lib/logger";
import {
  getGrievances,
  getGrievanceStats,
  GrievanceStatus,
  GrievanceCategory,
} from "@/lib/grievance";

/**
 * GET /api/admin/grievances
 *
 * List grievances with filters + stats (admin only)
 * Query params: status, email, category, limit, offset
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

    const { data: userRole } = await supabase
      .from("user_role")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userRole || !["admin", "super_admin"].includes(userRole.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") as GrievanceStatus | null;
    const email = url.searchParams.get("email");
    const category = url.searchParams.get("category") as GrievanceCategory | null;
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const [{ grievances, total }, stats] = await Promise.all([
      getGrievances({
        status: status || undefined,
        email: email || undefined,
        category: category || undefined,
        limit,
        offset,
      }),
      getGrievanceStats(),
    ]);

    return NextResponse.json({
      success: true,
      grievances,
      total,
      stats,
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_list_grievances_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
