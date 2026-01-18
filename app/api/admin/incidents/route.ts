import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { getIncidents, getIncidentStats } from "@/lib/incident";
import { logAuth, logError } from "@/lib/logger";
import type { IncidentStatus, IncidentSeverity, IncidentType } from "@/lib/incident";

/**
 * GET /api/admin/incidents
 * List security incidents with optional filters
 */
export async function GET(request: Request) {
  try {
    const { user } = await requireRole("admin");
    logAuth("admin_view_incidents", { userId: user.id });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as IncidentStatus | "all" | null;
    const severity = searchParams.get("severity") as IncidentSeverity | null;
    const type = searchParams.get("type") as IncidentType | null;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const includeStats = searchParams.get("stats") === "true";

    const { incidents, total } = await getIncidents({
      status: status || "open",
      severity: severity || undefined,
      type: type || undefined,
      limit,
      offset,
    });

    const response: {
      incidents: typeof incidents;
      total: number;
      stats?: Record<IncidentSeverity, number>;
    } = { incidents, total };

    // Optionally include stats for dashboard badges
    if (includeStats) {
      response.stats = await getIncidentStats();
    }

    return NextResponse.json(response);
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(error as Error, { endpoint: "/api/admin/incidents" });
    return NextResponse.json(
      { error: "Failed to fetch incidents" },
      { status: 500 }
    );
  }
}
