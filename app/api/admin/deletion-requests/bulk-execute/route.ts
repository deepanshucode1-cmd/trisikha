import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logError, logSecurityEvent } from "@/lib/logger";
import {
  getDeletionRequestById,
  executeDeletionRequest,
} from "@/lib/deletion-request";
import { sendDeletionCompleted } from "@/lib/email";

/**
 * POST /api/admin/deletion-requests/bulk-execute
 *
 * Execute multiple deletion requests at once
 * Body: { requestIds: string[] }
 */
export async function POST(req: Request) {
  try {
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

    // Parse request body
    const body = await req.json();
    const { requestIds } = body;

    if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
      return NextResponse.json(
        { error: "requestIds array is required" },
        { status: 400 }
      );
    }

    // Limit bulk execution to prevent timeout
    if (requestIds.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 requests can be executed at once" },
        { status: 400 }
      );
    }

    const results: {
      id: string;
      success: boolean;
      status: string;
      message: string;
      hasPaidOrders?: boolean;
    }[] = [];

    // Process each request
    for (const id of requestIds) {
      try {
        // Get request to check status and email
        const request = await getDeletionRequestById(id);

        if (!request) {
          results.push({
            id,
            success: false,
            status: "not_found",
            message: "Deletion request not found",
          });
          continue;
        }

        if (!["pending", "eligible"].includes(request.status)) {
          results.push({
            id,
            success: false,
            status: request.status,
            message: `Cannot execute request with status '${request.status}'`,
          });
          continue;
        }

        // Execute deletion
        const result = await executeDeletionRequest(id, user.id);

        // Send completion email if fully deleted
        if (result.success && result.status === "completed") {
          try {
            await sendDeletionCompleted({
              email: request.guest_email,
              ordersAnonymized: result.ordersDeleted,
            });
          } catch {
            // Don't fail if email fails
          }
        }

        results.push({
          id,
          success: result.success,
          status: result.status,
          message: result.message,
          hasPaidOrders: result.hasPaidOrders,
        });
      } catch (err) {
        logError(err as Error, {
          context: "bulk_execute_single_request_failed",
          requestId: id,
        });
        results.push({
          id,
          success: false,
          status: "error",
          message: "Failed to process request",
        });
      }
    }

    // Summarize results
    const summary = {
      total: requestIds.length,
      completed: results.filter((r) => r.status === "completed").length,
      deferred: results.filter((r) => r.status === "deferred_legal").length,
      failed: results.filter(
        (r) => !r.success || r.status === "failed" || r.status === "error"
      ).length,
      skipped: results.filter(
        (r) => r.status === "not_found" || !["pending", "eligible"].includes(r.status)
      ).length,
    };

    logSecurityEvent("admin_bulk_executed_deletion_requests", {
      adminId: user.id,
      requestCount: requestIds.length,
      ...summary,
    });

    return NextResponse.json({
      success: true,
      message: `Processed ${requestIds.length} deletion requests`,
      summary,
      results,
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_bulk_execute_deletion_requests_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
