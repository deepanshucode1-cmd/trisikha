import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { requireRole, handleAuthError } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { reviewRemovalSchema } from "@/lib/validation";
import { sanitizeObject } from "@/lib/xss";
import { logError, logSecurityEvent } from "@/lib/logger";
import { handleApiError } from "@/lib/errors";

/**
 * PATCH /api/admin/reviews/[id]
 *
 * Restore a hidden review (set is_visible = true)
 * Admin only, CSRF protected
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole("admin");
    if ("error" in authResult) {
      return handleAuthError(authResult);
    }

    const csrfResult = await requireCsrf(req);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

    const { id } = await params;
    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("reviews")
      .select("id, product_name, is_visible")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    if (existing.is_visible) {
      return NextResponse.json({ error: "Review is already visible" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("reviews")
      .update({
        is_visible: true,
        removed_by_admin_at: null,
        removal_reason: null,
      })
      .eq("id", id);

    if (updateError) {
      logError(new Error("Failed to restore review"), {
        error: updateError.message,
        reviewId: id,
      });
      return NextResponse.json({ error: "Failed to restore review" }, { status: 500 });
    }

    logSecurityEvent("admin_restored_review", {
      reviewId: id,
      productName: existing.product_name,
      adminId: authResult.user.id,
    });

    return NextResponse.json({ success: true, message: "Review restored" });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/admin/reviews/[id]" });
  }
}

/**
 * DELETE /api/admin/reviews/[id]
 *
 * Soft-delete a review (set is_visible = false)
 * Admin only, CSRF protected
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole("admin");
    if ("error" in authResult) {
      return handleAuthError(authResult);
    }

    const csrfResult = await requireCsrf(req);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const validatedData = reviewRemovalSchema.parse(body);
    const sanitizedData = sanitizeObject(validatedData);

    const supabase = createServiceClient();

    // Check review exists
    const { data: existing } = await supabase
      .from("reviews")
      .select("id, product_name, is_visible")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    if (!existing.is_visible) {
      return NextResponse.json(
        { error: "Review is already hidden" },
        { status: 400 }
      );
    }

    // Soft-delete the review
    const { error: updateError } = await supabase
      .from("reviews")
      .update({
        is_visible: false,
        removed_by_admin_at: new Date().toISOString(),
        removal_reason: sanitizedData.reason || null,
      })
      .eq("id", id);

    if (updateError) {
      logError(new Error("Failed to remove review"), {
        error: updateError.message,
        reviewId: id,
      });
      return NextResponse.json(
        { error: "Failed to remove review" },
        { status: 500 }
      );
    }

    logSecurityEvent("admin_removed_review", {
      reviewId: id,
      productName: existing.product_name,
      adminId: authResult.user.id,
      reason: sanitizedData.reason || "No reason provided",
    });

    return NextResponse.json({
      success: true,
      message: "Review has been hidden",
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/admin/reviews/[id]" });
  }
}
