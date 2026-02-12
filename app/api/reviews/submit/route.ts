import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { reviewSubmitSchema } from "@/lib/validation";
import { sanitizeObject } from "@/lib/xss";
import { reviewSubmitRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { logError } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success } = await reviewSubmitRateLimit.limit(`review-submit:${ip}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();

    // Zod validation
    const validatedData = reviewSubmitSchema.parse(body);

    // XSS sanitization
    const sanitizedData = sanitizeObject(validatedData);

    const supabase = createServiceClient();

    // Look up and validate the token
    const { data: tokenData, error: tokenError } = await supabase
      .from("review_tokens")
      .select("id, order_id, order_item_id, product_id, product_name, expires_at, consumed_at")
      .eq("token", sanitizedData.token)
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { error: "Invalid review token" },
        { status: 400 }
      );
    }

    if (tokenData.consumed_at) {
      return NextResponse.json(
        { error: "This review link has already been used" },
        { status: 400 }
      );
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This review link has expired" },
        { status: 400 }
      );
    }

    // Check order is still delivered
    const { data: order } = await supabase
      .from("orders")
      .select("order_status, return_status")
      .eq("id", tokenData.order_id)
      .single();

    if (!order || order.order_status !== "DELIVERED" || (order.return_status !== null && order.return_status !== "NOT_REQUESTED")) {
      return NextResponse.json(
        { error: "Review cannot be submitted for this order" },
        { status: 400 }
      );
    }

    // Insert the review
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .insert({
        product_id: tokenData.product_id,
        order_id: tokenData.order_id,
        order_item_id: tokenData.order_item_id,
        review_token_id: tokenData.id,
        product_name: tokenData.product_name,
        rating: sanitizedData.rating,
        review_text: sanitizedData.review_text || null,
      })
      .select("id, rating, review_text, created_at")
      .single();

    if (reviewError) {
      // Handle unique constraint violation (duplicate review)
      if (reviewError.code === "23505") {
        return NextResponse.json(
          { error: "You have already reviewed this product" },
          { status: 409 }
        );
      }
      logError(new Error("Failed to insert review"), {
        error: reviewError.message,
        tokenId: tokenData.id,
      });
      return NextResponse.json(
        { error: "Failed to submit review" },
        { status: 500 }
      );
    }

    // Mark token as consumed
    await supabase
      .from("review_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", tokenData.id);

    return NextResponse.json({
      success: true,
      review: {
        id: review.id,
        rating: review.rating,
        review_text: review.review_text,
        created_at: review.created_at,
      },
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/reviews/submit" });
  }
}
