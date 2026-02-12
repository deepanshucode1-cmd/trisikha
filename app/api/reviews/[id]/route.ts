import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { z } from "zod";

const VALID_SORTS = ["newest", "oldest", "highest", "lowest", "most_helpful"] as const;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`reviews:${ip}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const productId = (await params).id;

    // Validate productId is a UUID
    const uuidResult = z.string().uuid().safeParse(productId);
    if (!uuidResult.success) {
      return NextResponse.json(
        { error: "Invalid product ID" },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "10")));
    const sort = (url.searchParams.get("sort") || "newest") as typeof VALID_SORTS[number];

    if (!VALID_SORTS.includes(sort)) {
      return NextResponse.json(
        { error: "Invalid sort option" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const offset = (page - 1) * limit;

    // Determine sort column and direction
    let orderColumn: string;
    let ascending: boolean;
    switch (sort) {
      case "oldest":
        orderColumn = "created_at";
        ascending = true;
        break;
      case "highest":
        orderColumn = "rating";
        ascending = false;
        break;
      case "lowest":
        orderColumn = "rating";
        ascending = true;
        break;
      case "most_helpful":
        orderColumn = "helpful_count";
        ascending = false;
        break;
      default: // newest
        orderColumn = "created_at";
        ascending = false;
    }

    // Fetch reviews
    const { data: reviews, error: reviewError, count } = await supabase
      .from("reviews")
      .select("id, rating, review_text, helpful_count, created_at", { count: "exact" })
      .eq("product_id", productId)
      .eq("is_visible", true)
      .order(orderColumn, { ascending })
      .range(offset, offset + limit - 1);

    if (reviewError) {
      logError(new Error("Failed to fetch reviews"), {
        error: reviewError.message,
        productId,
      });
      return NextResponse.json(
        { error: "Failed to fetch reviews" },
        { status: 500 }
      );
    }

    // Get aggregate stats from products table (cached by trigger)
    const { data: product } = await supabase
      .from("products")
      .select("avg_rating, review_count")
      .eq("id", productId)
      .single();

    // Get rating distribution for the rating bars
    const { data: distribution } = await supabase
      .from("reviews")
      .select("rating")
      .eq("product_id", productId)
      .eq("is_visible", true);

    const ratingDistribution = [0, 0, 0, 0, 0]; // index 0 = 1 star, index 4 = 5 stars
    if (distribution) {
      for (const r of distribution) {
        ratingDistribution[r.rating - 1]++;
      }
    }

    return NextResponse.json({
      reviews: reviews || [],
      total: count || 0,
      avgRating: product?.avg_rating || null,
      reviewCount: product?.review_count || 0,
      ratingDistribution,
      page,
      limit,
    });
  } catch (error) {
    logError(error as Error, { endpoint: "/api/reviews/[productId]" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
