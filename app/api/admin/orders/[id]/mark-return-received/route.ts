import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { requireRole, handleAuthError } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { handleApiError } from "@/lib/errors";
import { logOrder, logError } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/admin/orders/[id]/mark-return-received
 *
 * Admin webhook fallback: manually mark a return order as received at warehouse.
 * Only allowed when return_status is RETURN_PICKUP_SCHEDULED or RETURN_IN_TRANSIT.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfResult = await requireCsrf(req);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

    const { user } = await requireRole("admin");
    const { id: orderId } = await params;

    if (!orderId) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Atomic update: only transition from allowed statuses
    const { data: updated, error } = await supabase
      .from("orders")
      .update({
        return_status: "RETURN_DELIVERED",
      })
      .eq("id", orderId)
      .in("return_status", ["RETURN_PICKUP_SCHEDULED", "RETURN_IN_TRANSIT"])
      .select("id, return_status");

    if (error) {
      logError(new Error(error.message), { context: "mark_return_received_failed", orderId });
      return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
    }

    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: "Order is not eligible to be marked as received. It must be in RETURN_PICKUP_SCHEDULED or RETURN_IN_TRANSIT status." },
        { status: 400 }
      );
    }

    logOrder("return_marked_received", { orderId, adminId: user.id });

    // DPDP Audit
    const ip = getClientIp(req);
    await logDataAccess({
      tableName: "orders",
      operation: "UPDATE",
      userId: user.id,
      userRole: "admin",
      ip,
      queryType: "single",
      rowCount: 1,
      endpoint: `/api/admin/orders/${orderId}/mark-return-received`,
      reason: "Admin manually marked return as received at warehouse",
      oldData: { orderId },
      newData: { orderId, return_status: "RETURN_DELIVERED" },
    });

    return NextResponse.json({ success: true, message: "Return marked as received" });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return handleAuthError(error);
    }
    return handleApiError(error, { endpoint: "/api/admin/orders/[id]/mark-return-received" });
  }
}
