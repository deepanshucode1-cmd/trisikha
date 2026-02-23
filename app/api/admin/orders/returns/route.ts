import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { requireRole, handleAuthError } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { logError } from "@/lib/logger";

/**
 * GET /api/admin/orders/returns
 *
 * Fetch all unresolved return orders for admin management.
 * Excludes NOT_REQUESTED, RETURN_REFUND_COMPLETED, and RETURN_CANCELLED.
 */
export async function GET() {
  try {
    await requireRole("admin");

    const supabase = createServiceClient();

    const { data: orders, error } = await supabase
      .from("orders")
      .select(`
        id,
        total_amount,
        shipping_first_name,
        shipping_last_name,
        guest_email,
        guest_phone,
        order_status,
        return_status,
        return_reason,
        return_refund_amount,
        return_requested_at,
        return_pickup_awb,
        return_order_id,
        return_pickup_scheduled_at,
        return_admin_note,
        return_deduction_amount,
        return_deduction_reason,
        return_inspection_photos,
        payment_id,
        refund_status,
        created_at
      `)
      .not("return_status", "in", "(NOT_REQUESTED,RETURN_REFUND_COMPLETED,RETURN_CANCELLED)")
      .order("return_requested_at", { ascending: false });

    if (error) {
      logError(new Error("Failed to fetch return orders"), { error: error.message });
      return NextResponse.json({ error: "Failed to fetch return orders" }, { status: 500 });
    }

    // Fetch order items for each return order
    const orderIds = (orders || []).map((o) => o.id);
    let orderItemsMap: Record<string, unknown[]> = {};

    if (orderIds.length > 0) {
      const { data: allItems, error: itemsError } = await supabase
        .from("order_items")
        .select("order_id, product_name, quantity, unit_price, sku")
        .in("order_id", orderIds);

      if (!itemsError && allItems) {
        for (const item of allItems) {
          if (!orderItemsMap[item.order_id]) {
            orderItemsMap[item.order_id] = [];
          }
          orderItemsMap[item.order_id].push(item);
        }
      }
    }

    const ordersWithItems = (orders || []).map((order) => ({
      ...order,
      items: orderItemsMap[order.id] || [],
    }));

    return NextResponse.json({ orders: ordersWithItems });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return handleAuthError(error);
    }
    return handleApiError(error, { endpoint: "/api/admin/orders/returns" });
  }
}
