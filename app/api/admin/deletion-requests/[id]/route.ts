import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logError } from "@/lib/logger";
import { getDeletionRequestById } from "@/lib/deletion-request";

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

    if (["pending", "deferred_legal"].includes(request.status)) {
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

