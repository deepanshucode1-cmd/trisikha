import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { createIncident, updateIncident } from "@/lib/incident";
import { sendAlertToAll } from "@/lib/alert-routing";
import { trackSecurityEvent, logSecurityEvent, logError } from "@/lib/logger";

/**
 * UptimeRobot webhook payload structure
 * https://uptimerobot.com/help/integrations
 */
interface UptimeRobotPayload {
  monitorID: string;
  monitorURL: string;
  monitorFriendlyName: string;
  alertType: string; // "1" = Down, "2" = Up, "3" = SSL Expiry
  alertTypeFriendlyName: string; // "Down", "Up", etc.
  alertDetails?: string;
  alertDuration?: string; // Duration in seconds (for Up alerts)
  monitorAlertContacts?: string;
  sslExpiryDate?: string;
  sslExpiryDaysLeft?: string;
}

/**
 * HetrixTools webhook payload structure
 * https://docs.hetrixtools.com/uptime-monitoring-webhook-notifications/
 */
interface HetrixToolsPayload {
  monitor_id: string;
  monitor_name: string;
  monitor_target: string;
  monitor_type: string; // "website" | "ping" | "service" | "smtp"
  monitor_category?: string;
  monitor_status: "online" | "offline";
  timestamp: number; // Unix timestamp
  monitor_errors?: Record<string, string>; // { "Location": "error message" } - only when offline
}

/**
 * Normalized payload for internal processing
 */
interface NormalizedPayload {
  source: "uptimerobot" | "hetrixtools";
  monitorId: string;
  monitorName: string;
  monitorUrl: string;
  status: "up" | "down" | "other";
  alertDetails?: string;
  alertDuration?: string;
  sslExpiryDaysLeft?: string;
  sslExpiryDate?: string;
}

/**
 * Webhook endpoint for uptime monitoring alerts
 *
 * POST /api/webhooks/monitoring?secret=YOUR_SECRET
 *
 * Supported services:
 * - UptimeRobot (https://uptimerobot.com)
 * - HetrixTools (https://hetrixtools.com)
 *
 * This endpoint handles:
 * 1. DOWN alerts: Creates service_disruption incident, logs to uptime_log
 * 2. UP alerts: Auto-resolves open incident, sends recovery notification to Slack/Discord
 * 3. SSL alerts: Sends warning notifications for expiring certificates (UptimeRobot only)
 *
 * IMPORTANT - Alerting Architecture:
 * ─────────────────────────────────
 * DOWN alerts: Configure native email alerts in your monitoring service
 *              because this endpoint is unreachable when the server is fully down.
 *
 * UP alerts:   This endpoint receives recovery notifications and sends
 *              supplementary alerts to Slack/Discord (server is back up).
 *
 * This design ensures you receive DOWN notifications even during complete outages.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Verify webhook secret
  const secret = request.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.MONITORING_WEBHOOK_SECRET;

  if (!expectedSecret) {
    logError(new Error("MONITORING_WEBHOOK_SECRET not configured"), {
      endpoint: "/api/webhooks/monitoring",
    });
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  if (secret !== expectedSecret) {
    await trackSecurityEvent("webhook_signature_invalid", {
      endpoint: "/api/webhooks/monitoring",
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  try {
    // Parse payload (supports JSON and form-urlencoded)
    const contentType = request.headers.get("content-type") || "";
    let rawPayload: UptimeRobotPayload | HetrixToolsPayload;

    if (contentType.includes("application/json")) {
      rawPayload = await request.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      rawPayload = Object.fromEntries(formData.entries()) as unknown as UptimeRobotPayload;
    } else {
      // Try to parse as JSON anyway (for testing)
      const text = await request.text();
      try {
        rawPayload = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: "Unsupported content type" },
          { status: 400 }
        );
      }
    }

    // Detect source and normalize payload
    const payload = normalizePayload(rawPayload);

    logSecurityEvent("monitoring_webhook_received", {
      source: payload.source,
      monitorId: payload.monitorId,
      status: payload.status,
      monitorName: payload.monitorName,
    });

    const supabase = createServiceClient();

    // Handle based on status
    if (payload.status === "down") {
      await handleDownAlert(supabase, payload);
    } else if (payload.status === "up") {
      await handleUpAlert(supabase, payload);
    } else {
      await handleOtherAlert(payload);
    }

    const latencyMs = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        source: payload.source,
        processed: payload.status,
        latency_ms: latencyMs,
      },
      { status: 200 }
    );
  } catch (error) {
    logError(error as Error, { endpoint: "/api/webhooks/monitoring" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Detect monitoring service and normalize payload to common format
 */
function normalizePayload(raw: UptimeRobotPayload | HetrixToolsPayload): NormalizedPayload {
  // HetrixTools detection: has monitor_status field
  if ("monitor_status" in raw) {
    const hetrix = raw as HetrixToolsPayload;
    const errorMessages = hetrix.monitor_errors
      ? Object.entries(hetrix.monitor_errors).map(([loc, err]) => `${loc}: ${err}`).join("; ")
      : undefined;

    return {
      source: "hetrixtools",
      monitorId: hetrix.monitor_id,
      monitorName: hetrix.monitor_name,
      monitorUrl: hetrix.monitor_target,
      status: hetrix.monitor_status === "offline" ? "down" : "up",
      alertDetails: errorMessages,
    };
  }

  // UptimeRobot format
  const uptime = raw as UptimeRobotPayload;
  let status: "up" | "down" | "other" = "other";

  if (uptime.alertType === "1" || uptime.alertTypeFriendlyName?.toLowerCase() === "down") {
    status = "down";
  } else if (uptime.alertType === "2" || uptime.alertTypeFriendlyName?.toLowerCase() === "up") {
    status = "up";
  }

  return {
    source: "uptimerobot",
    monitorId: uptime.monitorID,
    monitorName: uptime.monitorFriendlyName,
    monitorUrl: uptime.monitorURL,
    status,
    alertDetails: uptime.alertDetails,
    alertDuration: uptime.alertDuration,
    sslExpiryDaysLeft: uptime.sslExpiryDaysLeft,
    sslExpiryDate: uptime.sslExpiryDate,
  };
}

/**
 * Handle DOWN alert from monitoring service
 *
 * IMPORTANT: If this endpoint receives a DOWN alert, the server is at least
 * partially responsive. For complete outages, this endpoint won't be reachable.
 *
 * Primary DOWN notifications should be configured via your monitoring service's
 * native email alerts which are sent from their servers.
 *
 * This handler is useful for:
 * - Partial outages (server responding slowly but still up)
 * - Creating incident records in the database
 * - Logging to uptime_log for compliance tracking
 */
async function handleDownAlert(
  supabase: ReturnType<typeof createServiceClient>,
  payload: NormalizedPayload
) {
  // Create service_disruption incident (for internal tracking)
  try {
    await createIncident({
      incident_type: "service_disruption",
      severity: "critical",
      endpoint: payload.monitorUrl,
      description: `Service disruption detected: ${payload.monitorName} is DOWN`,
      details: {
        source: payload.source,
        monitorId: payload.monitorId,
        monitorName: payload.monitorName,
        monitorUrl: payload.monitorUrl,
        alertDetails: payload.alertDetails,
      },
    });
  } catch (err) {
    logError(err as Error, { context: "create_disruption_incident" });
  }

  // Log to uptime_log for compliance/SLA tracking
  try {
    await supabase.from("uptime_log").insert({
      status: "unhealthy",
      source: payload.source,
      error_message: `DOWN alert: ${payload.alertDetails || "No details"}`,
    });
  } catch (err) {
    logError(err as Error, { context: "uptime_log_down" });
  }

  // NOTE: We intentionally do NOT send Slack/Discord alerts here.
  // If this endpoint is reachable, the server isn't fully down,
  // and the monitoring service's native integrations handle primary alerting.
  // This avoids duplicate notifications and ensures alerts work even
  // when the server is completely unreachable.
}

/**
 * Handle UP (recovery) alert from monitoring service
 */
async function handleUpAlert(
  supabase: ReturnType<typeof createServiceClient>,
  payload: NormalizedPayload
) {
  // Find and resolve open service_disruption incident
  try {
    const { data: openIncident } = await supabase.rpc("get_open_disruption_incident");

    if (openIncident) {
      await updateIncident(openIncident, {
        status: "resolved",
        notes: `Auto-resolved (${payload.source}): Service recovered after ${payload.alertDuration || "unknown"} seconds downtime`,
      });
    }
  } catch (err) {
    logError(err as Error, { context: "resolve_disruption_incident" });
  }

  // Log recovery to uptime_log
  const downtimeSeconds = payload.alertDuration ? parseInt(payload.alertDuration, 10) : undefined;

  try {
    await supabase.from("uptime_log").insert({
      status: "healthy",
      source: payload.source,
      error_message: downtimeSeconds
        ? `Recovery after ${downtimeSeconds}s downtime`
        : "Service recovered",
    });
  } catch (err) {
    logError(err as Error, { context: "uptime_log_up" });
  }

  // Send recovery alerts to Slack/Discord
  try {
    await sendAlertToAll({
      type: "up",
      monitorName: payload.monitorName,
      monitorUrl: payload.monitorUrl,
      timestamp: new Date().toISOString(),
      duration: downtimeSeconds,
      details: { alertDetails: payload.alertDetails, source: payload.source },
    });
  } catch (err) {
    logError(err as Error, { context: "send_up_alert" });
  }
}

/**
 * Handle other alert types (SSL expiry, etc.)
 */
async function handleOtherAlert(payload: NormalizedPayload) {
  // Log the alert for visibility
  logSecurityEvent("monitoring_alert_other", {
    source: payload.source,
    monitorName: payload.monitorName,
    sslExpiryDaysLeft: payload.sslExpiryDaysLeft,
    sslExpiryDate: payload.sslExpiryDate,
  });

  // Send notification for SSL expiry warnings (UptimeRobot only)
  if (payload.sslExpiryDaysLeft) {
    const daysLeft = parseInt(payload.sslExpiryDaysLeft, 10);

    if (daysLeft <= 14) {
      try {
        await sendAlertToAll({
          type: "degraded",
          monitorName: `SSL Certificate (${payload.monitorName})`,
          monitorUrl: payload.monitorUrl,
          timestamp: new Date().toISOString(),
          details: {
            sslExpiryDate: payload.sslExpiryDate,
            daysLeft,
            source: payload.source,
          },
        });
      } catch (err) {
        logError(err as Error, { context: "send_ssl_alert" });
      }
    }
  }
}

/**
 * GET endpoint for testing/verification
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.MONITORING_WEBHOOK_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "ok",
    message: "Monitoring webhook endpoint is active",
    supported_services: ["uptimerobot", "hetrixtools"],
    timestamp: new Date().toISOString(),
  });
}
