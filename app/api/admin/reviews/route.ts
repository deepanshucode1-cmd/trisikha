import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { requireRole, handleAuthError } from "@/lib/auth";
import { logError } from "@/lib/logger";

/**
 * GET /api/admin/reviews
 *
 * List all reviews with filters (admin only)
 * Query params: page, limit, product_id, visible (true|false|all)
 */
export async function GET(req: Request) {
  try {
    const authResult = await requireRole("admin");
    if ("error" in authResult) {
      return handleAuthError(authResult);
    }

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const productId = url.searchParams.get("product_id");
    const visible = url.searchParams.get("visible") || "all";

    const supabase = createServiceClient();
    const offset = (page - 1) * limit;

    let query = supabase
      .from("reviews")
      .select(
        "id, product_id, product_name, order_id, rating, review_text, helpful_count, is_visible, removed_by_admin_at, removal_reason, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (productId) {
      query = query.eq("product_id", productId);
    }

    if (visible === "true") {
      query = query.eq("is_visible", true);
    } else if (visible === "false") {
      query = query.eq("is_visible", false);
    }

    const { data: reviews, error, count } = await query;

    if (error) {
      logError(new Error("Failed to fetch admin reviews"), { error: error.message });
      return NextResponse.json(
        { error: "Failed to fetch reviews" },
        { status: 500 }
      );
    }

    // Get summary stats
    const { data: stats } = await supabase
      .from("reviews")
      .select("rating, is_visible");

    const totalReviews = stats?.length || 0;
    const visibleReviews = stats?.filter((r) => r.is_visible).length || 0;
    const avgRating =
      totalReviews > 0
        ? Number(
            (
              stats!.reduce((sum, r) => sum + r.rating, 0) / totalReviews
            ).toFixed(1)
          )
        : null;

    return NextResponse.json({
      reviews: reviews || [],
      total: count || 0,
      page,
      limit,
      stats: {
        totalReviews,
        visibleReviews,
        removedReviews: totalReviews - visibleReviews,
        avgRating,
      },
    });
  } catch (error) {
    logError(error as Error, { endpoint: "/api/admin/reviews" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
