import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { verifyOrderAccess, AuthError, requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";

export async function GET(
  req: Request,
  { params }: { params: { order_id: string } }
) {
  try {
    const { order_id } = await params;

    // Try to get authenticated user (optional for guest orders)
    let user = null;
    try {
      const authResult = await requireAuth();
      user = authResult.user;
    } catch {
      // Guest user - will need to verify with email parameter
      user = null;
    }

    // Get email from query params for guest verification
    const url = new URL(req.url);
    const guestEmail = url.searchParams.get("email");

    // Verify order access
    await verifyOrderAccess(order_id, user, guestEmail || undefined);

    // Use service client to bypass RLS for guest order access
    const supabase = createServiceClient();

    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        id,
        total_amount,
        payment_status,
        order_status,
        shiprocket_status,
        shiprocket_awb_code,
        tracking_url,
        created_at
      `)
      .eq("id", order_id)
      .single();

    if (error || !order) {
      logSecurityEvent("order_fetch_failed", { orderId: order_id, error: error?.message });
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(order);
  } catch (error) {
    if (error instanceof AuthError) {
      logSecurityEvent("unauthorized_order_access", {
        orderId: (await params).order_id,
        error: (error as Error).message,
      });
    }
    return handleApiError(error, { endpoint: "/api/orders/get-order" });
  }
}
