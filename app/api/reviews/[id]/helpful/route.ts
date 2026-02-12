import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/utils/supabase/service";
import { reviewHelpfulRateLimit, getClientIp } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { z } from "zod";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success } = await reviewHelpfulRateLimit.limit(`review-helpful:${ip}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const reviewId = (await params).id;

    // Validate reviewId is a UUID
    const uuidResult = z.string().uuid().safeParse(reviewId);
    if (!uuidResult.success) {
      return NextResponse.json(
        { error: "Invalid review ID" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Hash the IP for privacy (don't store raw IPs)
    const voterIpHash = crypto
      .createHash("sha256")
      .update(ip + (process.env.IP_HASH_SALT || "trisikha-review-salt"))
      .digest("hex");

    // Check the review exists and is visible
    const { data: review } = await supabase
      .from("reviews")
      .select("id, helpful_count")
      .eq("id", reviewId)
      .eq("is_visible", true)
      .single();

    if (!review) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    // Try to insert vote (unique constraint prevents duplicates)
    const { error: voteError } = await supabase
      .from("review_helpful_votes")
      .insert({
        review_id: reviewId,
        voter_ip_hash: voterIpHash,
      });

    if (voteError) {
      // Unique constraint violation — already voted
      if (voteError.code === "23505") {
        return NextResponse.json({
          success: false,
          alreadyVoted: true,
          helpfulCount: review.helpful_count,
        });
      }
      logError(new Error("Failed to record helpful vote"), {
        error: voteError.message,
        reviewId,
      });
      return NextResponse.json(
        { error: "Failed to record vote" },
        { status: 500 }
      );
    }

    // Increment the helpful count
    const { data: updated } = await supabase
      .from("reviews")
      .update({ helpful_count: review.helpful_count + 1 })
      .eq("id", reviewId)
      .select("helpful_count")
      .single();

    return NextResponse.json({
      success: true,
      helpfulCount: updated?.helpful_count || review.helpful_count + 1,
    });
  } catch (error) {
    logError(error as Error, { endpoint: "/api/reviews/[reviewId]/helpful" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
