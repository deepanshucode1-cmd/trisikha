import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { updateIncident } from "@/lib/incident";
import { createServiceClient } from "@/utils/supabase/service";
import { requireCsrf } from "@/lib/csrf";
import { logAuth, logError } from "@/lib/logger";
import type { IncidentStatus } from "@/lib/incident";

/**
 * GET /api/admin/incidents/[id]
 * Get a single incident's details
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRole("admin");
    const { id } = await params;

    logAuth("admin_view_incident_detail", { userId: user.id, incidentId: id });

    const supabase = createServiceClient();
    const { data: incident, error } = await supabase
      .from("security_incidents")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    return NextResponse.json({ incident });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(error as Error, { endpoint: "/api/admin/incidents/[id]" });
    return NextResponse.json(
      { error: "Failed to fetch incident" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/incidents/[id]
 * Update incident status or add notes
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // CSRF protection
    const csrfResult = await requireCsrf(request);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

    const { user } = await requireRole("admin");
    const { id } = await params;

    const body = await request.json();
    const { status, notes } = body as {
      status?: IncidentStatus;
      notes?: string;
    };

    if (!status && !notes) {
      return NextResponse.json(
        { error: "Must provide status or notes to update" },
        { status: 400 }
      );
    }

    // Validate status if provided
    const validStatuses: IncidentStatus[] = ["open", "investigating", "resolved", "false_positive"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status value" },
        { status: 400 }
      );
    }

    await updateIncident(id, {
      status,
      notes,
      resolved_by: status === "resolved" || status === "false_positive" ? user.id : undefined,
    });

    logAuth("admin_update_incident", {
      userId: user.id,
      incidentId: id,
      newStatus: status,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(error as Error, { endpoint: "/api/admin/incidents/[id] PATCH" });
    return NextResponse.json(
      { error: "Failed to update incident" },
      { status: 500 }
    );
  }
}
