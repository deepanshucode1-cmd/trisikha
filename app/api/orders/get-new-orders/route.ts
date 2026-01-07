import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { logAuth, logError } from "@/lib/logger";

export async function GET() {
  try {
    // Require admin role
    const { supabase, user } = await requireRole("admin");

    logAuth("admin_access_new_orders", { userId: user.id });

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, shiprocket_status, created_at, total_amount, shipping_first_name, shipping_last_name"
      )
      .eq("shiprocket_status", "NOT_SHIPPED")
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false });

    if (error) {
      logError(new Error(error.message), { endpoint: "/api/orders/get-new-orders", userId: user.id });
      return NextResponse.json(
        { error: "Failed to load orders" },
        { status: 500 }
      );
    }

    return NextResponse.json({ orders: data ?? [] });
  } catch (error) {
    return handleAuthError(error);
  }
}
