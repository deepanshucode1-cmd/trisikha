import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logError, logSecurityEvent } from "@/lib/logger";
import {
  getDeletionRequestById,
  executeDeletionRequest,
} from "@/lib/deletion-request";
import { sendDeletionCompleted } from "@/lib/email";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/deletion-requests/[id]
 *
 * Get a specific deletion request with associated order details
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check admin authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    const { data: userRole } = await supabase
      .from("user_role")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userRole || !["admin", "super_admin"].includes(userRole.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get deletion request
    const request = await getDeletionRequestById(id);

    if (!request) {
      return NextResponse.json(
        { error: "Deletion request not found" },
        { status: 404 }
      );
    }

    // Get associated orders (if not yet deleted/anonymized)
    let orders: {
      id: string;
      payment_status: string;
      created_at: string;
      total_amount: number;
    }[] = [];

    if (["pending", "eligible", "deferred_legal"].includes(request.status)) {
      const { data: orderData } = await supabase
        .from("orders")
        .select("id, payment_status, created_at, total_amount")
        .eq("guest_email", request.guest_email)
        .order("created_at", { ascending: false });

      orders = orderData || [];
    }

    return NextResponse.json({
      success: true,
      request,
      orders,
      summary: {
        totalOrders: orders.length,
        paidOrders: orders.filter((o) => o.payment_status === "paid").length,
        unpaidOrders: orders.filter((o) => o.payment_status !== "paid").length,
      },
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_get_deletion_request_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/deletion-requests/[id]
 *
 * Execute a deletion request (admin approval action)
 *
 * - If NO paid orders: delete all order data
 * - If HAS paid orders: clear OTP only, defer deletion for 8 years
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check admin authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    const { data: userRole } = await supabase
      .from("user_role")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userRole || !["admin", "super_admin"].includes(userRole.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get request to check status
    const request = await getDeletionRequestById(id);

    if (!request) {
      return NextResponse.json(
        { error: "Deletion request not found" },
        { status: 404 }
      );
    }

    if (!["pending", "eligible"].includes(request.status)) {
      return NextResponse.json(
        {
          error: `Cannot execute deletion request with status '${request.status}'`,
          currentStatus: request.status,
        },
        { status: 400 }
      );
    }

    // Execute deletion
    const result = await executeDeletionRequest(id, user.id);

    // Send completion email if deletion was completed (no paid orders)
    if (result.success && result.status === "completed") {
      try {
        await sendDeletionCompleted({
          email: request.guest_email,
          ordersAnonymized: result.ordersDeleted,
        });
      } catch (emailError) {
        logError(emailError as Error, {
          context: "send_deletion_completed_email_failed",
          requestId: id,
        });
        // Don't fail the request if email fails
      }
    }

    logSecurityEvent("admin_executed_deletion_request", {
      requestId: id,
      adminId: user.id,
      result: result.status,
      hasPaidOrders: result.hasPaidOrders,
      paidOrdersCount: result.paidOrdersCount,
      ordersDeleted: result.ordersDeleted,
    });

    return NextResponse.json({
      success: result.success,
      status: result.status,
      message: result.message,
      details: {
        ordersDeleted: result.ordersDeleted,
        otpCleared: result.otpCleared,
        hasPaidOrders: result.hasPaidOrders,
        paidOrdersCount: result.paidOrdersCount,
        retentionEndDate: result.retentionEndDate?.toISOString().split("T")[0],
      },
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_execute_deletion_request_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
