// app/api/orders/get-order-detail/[id]/route.ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { verifyOrderAccess, AuthError, requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Use service client to bypass RLS for guest order access
    const supabase = createServiceClient();
    const { id } = await params;

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

    // Verify order access (checks ownership, admin role, or guest email)
    await verifyOrderAccess(id, user, guestEmail || undefined);

    // Fetch order data
    const { data: orderData, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (orderErr) {
      logSecurityEvent("order_fetch_failed", { orderId: id, error: orderErr.message });
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { data: itemData } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", id);

    return NextResponse.json({
      order: orderData,
      items: itemData || []
    });
  } catch (error) {
    if (error instanceof AuthError) {
      logSecurityEvent("unauthorized_order_access", {
        orderId: (await params).id,
        error: error.message,
      });
    }
    return handleApiError(error, { endpoint: "/api/orders/get-order-detail" });
  }
}
