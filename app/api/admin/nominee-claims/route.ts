import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logError } from "@/lib/logger";
import { getNomineeClaims, getNomineeClaimStats } from "@/lib/nominee";

/**
 * GET /api/admin/nominee-claims
 *
 * List nominee claims with optional filters and stats.
 */
export async function GET(req: Request) {
  try {
    const supabase = await createClient();
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
    const status = url.searchParams.get("status") as
      | "pending"
      | "verified"
      | "rejected"
      | "completed"
      | null;
    const email = url.searchParams.get("email") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const [claimsResult, stats] = await Promise.all([
      getNomineeClaims({
        status: status || undefined,
        email,
        limit,
        offset,
      }),
      getNomineeClaimStats(),
    ]);

    return NextResponse.json({
      success: true,
      claims: claimsResult.claims,
      total: claimsResult.total,
      stats,
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_get_nominee_claims_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
