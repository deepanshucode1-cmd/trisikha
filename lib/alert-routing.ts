import { logError, logSecurityEvent } from "./logger";

/**
 * Alert Routing Module
 *
 * Sends monitoring alerts to Slack and Discord webhooks.
 *
 * IMPORTANT - When to use this module:
 * ────────────────────────────────────
 * ✓ UP/Recovery alerts (server is back, so this code runs)
 * ✓ Degraded performance alerts (server is responding, just slow)
 * ✓ SSL expiry warnings (server is up)
 * ✓ Security incident alerts (triggered by other parts of the app)
 *
 * ✗ DOWN alerts during complete outages - these won't work because
 *   when the server is down, this code can't execute.
 *
 * For DOWN alerts, configure UptimeRobot's native integrations:
 * - Slack: UptimeRobot → Alert Contacts → Add → Slack
 * - Discord: UptimeRobot → Alert Contacts → Add → Webhook →
 *            Use Discord webhook URL: https://discord.com/api/webhooks/...
 * - Email: UptimeRobot → Alert Contacts → Add → Email
 *
 * These are sent from UptimeRobot's servers, not yours.
 */

/**
 * Alert types for monitoring notifications
 */
export type AlertType = "down" | "up" | "degraded";

export interface MonitoringAlert {
  type: AlertType;
  monitorName: string;
  monitorUrl?: string;
  timestamp: string;
  duration?: number; // downtime duration in seconds
  details?: Record<string, unknown>;
}

/**
 * Send alert to Slack webhook
 *
 * Requires SLACK_WEBHOOK_URL environment variable
 */
export async function sendAlertToSlack(alert: MonitoringAlert): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    return false;
  }

  const color = getAlertColor(alert.type);
  const emoji = getAlertEmoji(alert.type);
  const title = getAlertTitle(alert);

  const payload = {
    attachments: [
      {
        color,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `${emoji} ${title}`,
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Monitor:*\n${alert.monitorName}`,
              },
              {
                type: "mrkdwn",
                text: `*Status:*\n${alert.type.toUpperCase()}`,
              },
              {
                type: "mrkdwn",
                text: `*Time:*\n${new Date(alert.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
              },
              ...(alert.duration
                ? [
                    {
                      type: "mrkdwn",
                      text: `*Downtime:*\n${formatDuration(alert.duration)}`,
                    },
                  ]
                : []),
            ],
          },
          ...(alert.monitorUrl
            ? [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `<${alert.monitorUrl}|View Monitor>`,
                  },
                },
              ]
            : []),
        ],
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logError(new Error(`Slack webhook failed: ${response.status}`), {
        context: "slack_alert",
        alertType: alert.type,
      });
      return false;
    }

    logSecurityEvent("monitoring_alert_sent", {
      channel: "slack",
      alertType: alert.type,
      monitorName: alert.monitorName,
    });

    return true;
  } catch (err) {
    logError(err as Error, { context: "slack_alert", alertType: alert.type });
    return false;
  }
}

/**
 * Send alert to Discord webhook
 *
 * Requires DISCORD_WEBHOOK_URL environment variable
 */
export async function sendAlertToDiscord(alert: MonitoringAlert): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return false;
  }

  const color = getDiscordColor(alert.type);
  const emoji = getAlertEmoji(alert.type);
  const title = getAlertTitle(alert);

  const payload = {
    embeds: [
      {
        title: `${emoji} ${title}`,
        color,
        fields: [
          {
            name: "Monitor",
            value: alert.monitorName,
            inline: true,
          },
          {
            name: "Status",
            value: alert.type.toUpperCase(),
            inline: true,
          },
          {
            name: "Time",
            value: new Date(alert.timestamp).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            }),
            inline: true,
          },
          ...(alert.duration
            ? [
                {
                  name: "Downtime",
                  value: formatDuration(alert.duration),
                  inline: true,
                },
              ]
            : []),
        ],
        timestamp: alert.timestamp,
        footer: {
          text: "Trisikha Monitoring",
        },
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logError(new Error(`Discord webhook failed: ${response.status}`), {
        context: "discord_alert",
        alertType: alert.type,
      });
      return false;
    }

    logSecurityEvent("monitoring_alert_sent", {
      channel: "discord",
      alertType: alert.type,
      monitorName: alert.monitorName,
    });

    return true;
  } catch (err) {
    logError(err as Error, { context: "discord_alert", alertType: alert.type });
    return false;
  }
}

/**
 * Send alert to all configured channels
 */
export async function sendAlertToAll(alert: MonitoringAlert): Promise<{
  slack: boolean;
  discord: boolean;
}> {
  const [slack, discord] = await Promise.all([
    sendAlertToSlack(alert),
    sendAlertToDiscord(alert),
  ]);

  return { slack, discord };
}

/**
 * Helper functions
 */

function getAlertColor(type: AlertType): string {
  switch (type) {
    case "down":
      return "#dc3545"; // red
    case "up":
      return "#28a745"; // green
    case "degraded":
      return "#ffc107"; // yellow
    default:
      return "#6c757d"; // gray
  }
}

function getDiscordColor(type: AlertType): number {
  switch (type) {
    case "down":
      return 0xdc3545; // red
    case "up":
      return 0x28a745; // green
    case "degraded":
      return 0xffc107; // yellow
    default:
      return 0x6c757d; // gray
  }
}

function getAlertEmoji(type: AlertType): string {
  switch (type) {
    case "down":
      return "\u{1F534}"; // Red circle
    case "up":
      return "\u{1F7E2}"; // Green circle
    case "degraded":
      return "\u{1F7E1}"; // Yellow circle
    default:
      return "\u{26AA}"; // White circle
  }
}

function getAlertTitle(alert: MonitoringAlert): string {
  switch (alert.type) {
    case "down":
      return `${alert.monitorName} is DOWN`;
    case "up":
      return `${alert.monitorName} is back UP`;
    case "degraded":
      return `${alert.monitorName} is DEGRADED`;
    default:
      return `${alert.monitorName} status changed`;
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
