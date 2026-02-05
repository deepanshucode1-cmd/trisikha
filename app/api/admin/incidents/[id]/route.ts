import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { updateIncident, generateDpbReport } from "@/lib/incident";
import { createServiceClient } from "@/utils/supabase/service";
import { requireCsrf } from "@/lib/csrf";
import { logAuth, logError } from "@/lib/logger";
import type { IncidentStatus, DpbBreachType } from "@/lib/incident";

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
    const {
      status,
      notes,
      isPersonalDataBreach,
      dpbBreachType,
      dpbNotifiedAt,
      generateDpbReportData,
    } = body as {
      status?: IncidentStatus;
      notes?: string;
      isPersonalDataBreach?: boolean;
      dpbBreachType?: DpbBreachType;
      dpbNotifiedAt?: string;
      generateDpbReportData?: {
        affectedDataPrincipals: number;
        dataCategories: string[];
        breachDescription: string;
        containmentMeasures: string[];
        riskMitigation: string[];
        likelyConsequences?: string;
        transferToThirdParty?: boolean;
        crossBorderTransfer?: boolean;
      };
    };

    const hasStatusUpdate = status || notes;
    const hasDpbUpdate =
      isPersonalDataBreach !== undefined ||
      dpbBreachType !== undefined ||
      dpbNotifiedAt !== undefined ||
      generateDpbReportData !== undefined;

    if (!hasStatusUpdate && !hasDpbUpdate) {
      return NextResponse.json(
        { error: "Must provide at least one field to update" },
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

    // Validate dpbBreachType if provided
    const validBreachTypes: DpbBreachType[] = ["confidentiality", "integrity", "availability"];
    if (dpbBreachType && !validBreachTypes.includes(dpbBreachType)) {
      return NextResponse.json(
        { error: "Invalid breach type value" },
        { status: 400 }
      );
    }

    // Handle DPB report generation (separate flow — sends email + stamps timestamp)
    if (generateDpbReportData) {
      if (!dpbBreachType && !generateDpbReportData) {
        return NextResponse.json(
          { error: "Breach type is required for report generation" },
          { status: 400 }
        );
      }

      // Fetch current incident to get breach type if not provided in this request
      const supabase = createServiceClient();
      const { data: incident } = await supabase
        .from("security_incidents")
        .select("dpb_breach_type")
        .eq("id", id)
        .single();

      const breachType = dpbBreachType || incident?.dpb_breach_type;
      if (!breachType) {
        return NextResponse.json(
          { error: "Breach type must be set before generating a report" },
          { status: 400 }
        );
      }

      await generateDpbReport(id, {
        breachType: breachType as DpbBreachType,
        ...generateDpbReportData,
      });

      logAuth("admin_generate_dpb_report", {
        userId: user.id,
        incidentId: id,
      });

      return NextResponse.json({ success: true });
    }

    // Build update object
    const updateData: Parameters<typeof updateIncident>[1] = {};

    if (status) updateData.status = status;
    if (notes) updateData.notes = notes;
    if (status === "resolved" || status === "false_positive") {
      updateData.resolved_by = user.id;
    }
    if (isPersonalDataBreach !== undefined) {
      updateData.is_personal_data_breach = isPersonalDataBreach;
      // Clear breach fields when reclassifying as not a breach
      if (!isPersonalDataBreach) {
        updateData.dpb_breach_type = null;
        updateData.dpb_notified_at = null;
        updateData.dpb_report_generated_at = null;
      }
    }
    if (dpbBreachType) updateData.dpb_breach_type = dpbBreachType;
    if (dpbNotifiedAt) updateData.dpb_notified_at = dpbNotifiedAt;

    await updateIncident(id, updateData);

    logAuth("admin_update_incident", {
      userId: user.id,
      incidentId: id,
      newStatus: status,
      dpbClassification: isPersonalDataBreach,
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
