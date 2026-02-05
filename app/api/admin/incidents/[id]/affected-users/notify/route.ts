import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logError, logSecurityEvent } from "@/lib/logger";
import {
  notifyAllAffectedUsers,
  notifyAffectedUser,
  getAffectedUsersSummary,
} from "@/lib/incident-affected-users";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/incidents/[id]/affected-users/notify
 *
 * Notify affected users about a security incident
 *
 * Body for notify all pending:
 * {
 *   action: "notify_all"
 * }
 *
 * Body for notify single user:
 * {
 *   action: "notify_single",
 *   affectedUserId: "uuid"
 * }
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { id: incidentId } = await params;
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

    // Get incident details
    const { data: incident } = await supabase
      .from("security_incidents")
      .select("*")
      .eq("id", incidentId)
      .single();

    if (!incident) {
      return NextResponse.json(
        { error: "Incident not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { action } = body;

    const incidentDetails = {
      type: incident.incident_type,
      description: incident.description || "A security incident has occurred",
      occurredAt: new Date(incident.created_at),
      vendorName: incident.incident_type.includes("vendor")
        ? incident.description?.match(/razorpay|shiprocket/i)?.[0]
        : undefined,
    };

    // Action: Notify all pending users
    if (action === "notify_all") {
      const result = await notifyAllAffectedUsers({
        incidentId,
        incidentDetails,
      });

      logSecurityEvent("admin_notified_all_affected_users", {
        adminId: user.id,
        incidentId,
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
      });

      // Get updated summary
      const summary = await getAffectedUsersSummary(incidentId);

      return NextResponse.json({
        success: result.success,
        message: `Notification complete: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`,
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        summary,
      });
    }

    // Action: Notify single user
    if (action === "notify_single") {
      const { affectedUserId } = body;

      if (!affectedUserId) {
        return NextResponse.json(
          { error: "affectedUserId is required" },
          { status: 400 }
        );
      }

      const result = await notifyAffectedUser({
        affectedUserId,
        incidentDetails,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      logSecurityEvent("admin_notified_single_affected_user", {
        adminId: user.id,
        incidentId,
        affectedUserId,
      });

      return NextResponse.json({
        success: true,
        message: "Notification sent successfully",
      });
    }

    return NextResponse.json(
      { error: "action must be 'notify_all' or 'notify_single'" },
      { status: 400 }
    );
  } catch (error) {
    logError(error as Error, {
      context: "admin_notify_affected_users_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
