import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { createIncident, updateIncident } from "@/lib/incident";
import { sendAlertToAll } from "@/lib/alert-routing";
import { logSecurityEvent, logError } from "@/lib/logger";

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
 * Webhook endpoint for UptimeRobot alerts
 *
 * POST /api/webhooks/monitoring?secret=YOUR_SECRET
 *
 * This endpoint handles:
 * 1. DOWN alerts: Creates service_disruption incident, logs to uptime_log
 * 2. UP alerts: Auto-resolves open incident, sends recovery notification to Slack/Discord
 * 3. SSL alerts: Sends warning notifications for expiring certificates
 *
 * IMPORTANT - Alerting Architecture:
 * ─────────────────────────────────
 * DOWN alerts: Use UptimeRobot's NATIVE integrations (Slack/Discord/Email)
 *              because this endpoint is unreachable when the server is fully down.
 *              Configure at: UptimeRobot → My Settings → Alert Contacts
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
    logSecurityEvent("webhook_signature_invalid", {
      endpoint: "/api/webhooks/monitoring",
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  try {
    // Parse form data (UptimeRobot sends as form-urlencoded)
    const contentType = request.headers.get("content-type") || "";
    let payload: UptimeRobotPayload;

    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      payload = Object.fromEntries(formData.entries()) as unknown as UptimeRobotPayload;
    } else {
      // Try to parse as JSON anyway (for testing)
      const text = await request.text();
      try {
        payload = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: "Unsupported content type" },
          { status: 400 }
        );
      }
    }

    logSecurityEvent("monitoring_webhook_received", {
      monitorId: payload.monitorID,
      alertType: payload.alertTypeFriendlyName,
      monitorName: payload.monitorFriendlyName,
    });

    const supabase = createServiceClient();

    // Handle based on alert type
    if (payload.alertType === "1" || payload.alertTypeFriendlyName?.toLowerCase() === "down") {
      // Server is DOWN - create incident
      await handleDownAlert(supabase, payload);
    } else if (payload.alertType === "2" || payload.alertTypeFriendlyName?.toLowerCase() === "up") {
      // Server is UP (recovered) - resolve incident and notify
      await handleUpAlert(supabase, payload);
    } else {
      // Other alert types (SSL expiry, etc.)
      await handleOtherAlert(payload);
    }

    const latencyMs = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        processed: payload.alertTypeFriendlyName,
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
 * Handle DOWN alert from UptimeRobot
 *
 * IMPORTANT: If this endpoint receives a DOWN alert, the server is at least
 * partially responsive. For complete outages, this endpoint won't be reachable.
 *
 * Primary DOWN notifications should be configured via UptimeRobot's native
 * integrations (Slack, Discord, Email) which are sent from their servers:
 * - UptimeRobot → My Settings → Alert Contacts → Add Slack/Discord/Email
 *
 * This handler is useful for:
 * - Partial outages (server responding slowly but still up)
 * - Creating incident records in the database
 * - Logging to uptime_log for compliance tracking
 */
async function handleDownAlert(
  supabase: ReturnType<typeof createServiceClient>,
  payload: UptimeRobotPayload
) {
  // Create service_disruption incident (for internal tracking)
  try {
    await createIncident({
      incident_type: "service_disruption",
      severity: "critical",
      endpoint: payload.monitorURL,
      description: `Service disruption detected: ${payload.monitorFriendlyName} is DOWN`,
      details: {
        source: "uptimerobot",
        monitorId: payload.monitorID,
        monitorName: payload.monitorFriendlyName,
        monitorUrl: payload.monitorURL,
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
      source: "uptimerobot",
      error_message: `DOWN alert: ${payload.alertDetails || "No details"}`,
    });
  } catch (err) {
    logError(err as Error, { context: "uptime_log_down" });
  }

  // NOTE: We intentionally do NOT send Slack/Discord alerts here.
  // If this endpoint is reachable, the server isn't fully down,
  // and UptimeRobot's native integrations handle the primary alerting.
  // This avoids duplicate notifications and ensures alerts work even
  // when the server is completely unreachable.
}

/**
 * Handle UP (recovery) alert from UptimeRobot
 */
async function handleUpAlert(
  supabase: ReturnType<typeof createServiceClient>,
  payload: UptimeRobotPayload
) {
  // Find and resolve open service_disruption incident
  try {
    const { data: openIncident } = await supabase.rpc("get_open_disruption_incident");

    if (openIncident) {
      await updateIncident(openIncident, {
        status: "resolved",
        notes: `Auto-resolved: Service recovered after ${payload.alertDuration || "unknown"} seconds downtime`,
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
      source: "uptimerobot",
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
      monitorName: payload.monitorFriendlyName,
      monitorUrl: payload.monitorURL,
      timestamp: new Date().toISOString(),
      duration: downtimeSeconds,
      details: { alertDetails: payload.alertDetails },
    });
  } catch (err) {
    logError(err as Error, { context: "send_up_alert" });
  }
}

/**
 * Handle other alert types (SSL expiry, etc.)
 */
async function handleOtherAlert(payload: UptimeRobotPayload) {
  // Log the alert for visibility
  logSecurityEvent("monitoring_alert_other", {
    alertType: payload.alertTypeFriendlyName,
    monitorName: payload.monitorFriendlyName,
    sslExpiryDaysLeft: payload.sslExpiryDaysLeft,
    sslExpiryDate: payload.sslExpiryDate,
  });

  // Send notification for SSL expiry warnings
  if (payload.sslExpiryDaysLeft) {
    const daysLeft = parseInt(payload.sslExpiryDaysLeft, 10);

    if (daysLeft <= 14) {
      try {
        await sendAlertToAll({
          type: "degraded",
          monitorName: `SSL Certificate (${payload.monitorFriendlyName})`,
          monitorUrl: payload.monitorURL,
          timestamp: new Date().toISOString(),
          details: {
            sslExpiryDate: payload.sslExpiryDate,
            daysLeft,
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
    timestamp: new Date().toISOString(),
  });
}
