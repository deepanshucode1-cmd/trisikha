import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { reviewTokenSchema } from "@/lib/validation";
import { reviewVerifyRateLimit, getClientIp } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

export async function GET(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success } = await reviewVerifyRateLimit.limit(`review-verify:${ip}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    // Validate token format
    const parseResult = reviewTokenSchema.safeParse({ token });
    if (!parseResult.success) {
      return NextResponse.json(
        { valid: false, reason: "invalid" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Look up the token
    const { data: tokenData, error: tokenError } = await supabase
      .from("review_tokens")
      .select("id, order_id, product_id, product_name, expires_at, consumed_at")
      .eq("token", parseResult.data.token)
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json({ valid: false, reason: "invalid" });
    }

    // Check if already consumed
    if (tokenData.consumed_at) {
      return NextResponse.json({ valid: false, reason: "used" });
    }

    // Check expiry
    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, reason: "expired" });
    }

    // Check order is still delivered (not returned/cancelled)
    const { data: order } = await supabase
      .from("orders")
      .select("order_status, return_status")
      .eq("id", tokenData.order_id)
      .single();

    if (!order || order.order_status !== "DELIVERED" || (order.return_status !== null && order.return_status !== "NOT_REQUESTED")) {
      return NextResponse.json({ valid: false, reason: "order_cancelled" });
    }

    // Fetch product image if product still exists
    let productImage: string | null = null;
    if (tokenData.product_id) {
      const { data: product } = await supabase
        .from("products")
        .select("image_url")
        .eq("id", tokenData.product_id)
        .single();

      productImage = product?.image_url || null;
    }

    return NextResponse.json({
      valid: true,
      productName: tokenData.product_name,
      productImage,
      productId: tokenData.product_id,
    });
  } catch (error) {
    logError(error as Error, { endpoint: "/api/reviews/verify-token" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
