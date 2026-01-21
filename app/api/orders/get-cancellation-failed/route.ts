import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { logAuth, logError } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";

export async function GET() {
  try {
    // Require admin role
    const { supabase, user } = await requireRole("admin");

    logAuth("admin_access_cancellation_failed", { userId: user.id });

    const { data, error } = await supabase
      .from("orders")
      .select("id, shiprocket_status, created_at, total_amount, shipping_first_name, shipping_last_name")
      .eq("payment_status", "paid")
      .eq("order_status", "CANCELLATION_REQUESTED")
      .eq("cancellation_status", "CANCELLATION_REQUESTED")
      .or("shiprocket_status.eq.SHIPPING_CANCELLATION_FAILED,refund_status.eq.REFUND_FAILED");

    if (error) {
      logError(new Error(error.message), {
        endpoint: "/api/orders/get-cancellation-failed",
        userId: user.id,
      });
      return NextResponse.json(
        { error: "Failed to load orders" },
        { status: 500 }
      );
    }

    // DPDP Audit: Log admin access to failed cancellation orders
    await logDataAccess({
      tableName: "orders",
      operation: "SELECT",
      userId: user.id,
      userRole: "admin",
      queryType: (data?.length ?? 0) > 10 ? "bulk" : "single",
      rowCount: data?.length ?? 0,
      endpoint: "/api/orders/get-cancellation-failed",
      reason: "Admin dashboard - viewing failed cancellations (contains customer names)",
    });

    return NextResponse.json({ orders: data ?? [] });
  } catch (error) {
    return handleAuthError(error);
  }
}
