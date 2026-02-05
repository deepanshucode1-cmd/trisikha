import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logError } from "@/lib/logger";
import { getDeletionRequestStats } from "@/lib/deletion-request";

/**
 * GET /api/admin/deletion-requests/stats
 *
 * Get summary statistics for deletion requests
 */
export async function GET() {
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

    const stats = await getDeletionRequestStats();

    return NextResponse.json({
      success: true,
      stats,
      actionRequired: stats.eligible + stats.failed,
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_get_deletion_request_stats_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
