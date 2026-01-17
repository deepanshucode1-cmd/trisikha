import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { logAuth, logError } from "@/lib/logger";

export async function GET() {
  try {
    // Require admin role
    const { supabase, user } = await requireRole("admin");

    logAuth("admin_access_new_orders", { userId: user.id });

    // Fetch orders that need shipping actions (pre-pickup states)
    // Join with manifest_batches to get manifest URL
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        shiprocket_status,
        created_at,
        total_amount,
        shipping_first_name,
        shipping_last_name,
        shiprocket_order_id,
        shiprocket_shipment_id,
        shiprocket_awb_code,
        shiprocket_label_url,
        shiprocket_manifest_generated,
        shiprocket_manifest_url,
        pickup_scheduled_at,
        manifest_batches:shiprocket_manifest_batch_id (
          manifest_url
        )
      `)
      .eq("payment_status", "paid")
      .in("shiprocket_status", ["NOT_SHIPPED", "AWB_ASSIGNED", "PICKUP_SCHEDULED"])
      .order("created_at", { ascending: false });

    if (error) {
      logError(new Error(error.message), { endpoint: "/api/orders/get-new-orders", userId: user.id });
      return NextResponse.json(
        { error: "Failed to load orders" },
        { status: 500 }
      );
    }

    // Normalize manifest_url - prefer direct field, fallback to joined table
    const ordersWithManifest = (data ?? []).map(order => ({
      ...order,
      shiprocket_manifest_url: order.shiprocket_manifest_url ||
        (order.manifest_batches as { manifest_url?: string } | null)?.manifest_url || null,
      manifest_batches: undefined, // Remove nested object from response
    }));

    return NextResponse.json({ orders: ordersWithManifest });
  } catch (error) {
    return handleAuthError(error);
  }
}
