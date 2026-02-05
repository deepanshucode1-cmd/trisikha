/**
 * Seed script to insert dummy data for testing the Affected Users Tracking flow.
 *
 * Run: npx tsx scripts/seed-affected-users-test.ts
 *
 * Creates:
 * 1. Two security incidents (high + critical severity)
 * 2. Affected users linked to those incidents (with various notification statuses)
 *
 * This lets you test:
 * - Viewing affected users in the incident detail modal
 * - "Identify by Date Range" flow
 * - "Notify All Pending" flow
 * - Per-user notify / retry
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// Load .env manually since dotenv isn't installed (Next.js handles it at runtime)
const envPath = resolve(import.meta.dirname || __dirname, "../.env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  const val = trimmed.slice(eqIdx + 1);
  if (!process.env[key]) process.env[key] = val;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log("Seeding affected users test data...\n");

  // --- 1. Create security incidents ---

  const incidents = [
    {
      incident_type: "bulk_data_export",
      severity: "high",
      description:
        "Admin exported 250 order records via /api/admin/orders endpoint. Flagged by bulk export threshold.",
      status: "investigating",
      source_ip: "103.21.58.100",
      endpoint: "/api/admin/orders",
      details: {
        row_count: 250,
        table: "orders",
        admin_action: "SELECT",
        triggered_by: "audit_threshold",
      },
    },
    {
      incident_type: "unauthorized_access",
      severity: "critical",
      description:
        "Suspicious access pattern detected: multiple order lookups from unrecognized IP within 2 minutes.",
      status: "open",
      source_ip: "185.220.101.42",
      endpoint: "/api/admin/orders/[id]",
      details: {
        orders_accessed: 15,
        time_window_seconds: 120,
        user_agent: "python-requests/2.31.0",
      },
    },
  ];

  const { data: insertedIncidents, error: incidentError } = await supabase
    .from("security_incidents")
    .insert(incidents)
    .select("id, incident_type, severity");

  if (incidentError) {
    console.error("Failed to insert incidents:", incidentError.message);
    process.exit(1);
  }

  console.log("Created incidents:");
  for (const inc of insertedIncidents!) {
    console.log(`  [${inc.severity.toUpperCase()}] ${inc.incident_type} -> ${inc.id}`);
  }

  const bulkExportIncidentId = insertedIncidents![0].id;
  const unauthorizedAccessIncidentId = insertedIncidents![1].id;

  // --- 2. Create affected users for the bulk_data_export incident ---

  const bulkExportUsers = [
    {
      incident_id: bulkExportIncidentId,
      guest_email: "priya.sharma@example.com",
      guest_phone: "9876543210",
      affected_data_types: ["email", "phone", "address", "order_details"],
      notification_status: "pending",
    },
    {
      incident_id: bulkExportIncidentId,
      guest_email: "rahul.verma@example.com",
      guest_phone: "9123456789",
      affected_data_types: ["email", "phone", "order_details"],
      notification_status: "pending",
    },
    {
      incident_id: bulkExportIncidentId,
      guest_email: "anita.gupta@example.com",
      guest_phone: "9988776655",
      affected_data_types: ["email", "phone", "address", "payment_info"],
      notification_status: "sent",
      notified_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    },
    {
      incident_id: bulkExportIncidentId,
      guest_email: "vikram.singh@example.com",
      guest_phone: "9112233445",
      affected_data_types: ["email", "address"],
      notification_status: "failed",
      notification_error: "Email delivery failed: mailbox full",
      notification_attempts: 2,
    },
    {
      incident_id: bulkExportIncidentId,
      guest_email: "deepa.nair@example.com",
      guest_phone: null,
      affected_data_types: ["email", "order_details"],
      notification_status: "not_required",
    },
  ];

  // --- 3. Create affected users for the unauthorized_access incident ---

  const unauthorizedAccessUsers = [
    {
      incident_id: unauthorizedAccessIncidentId,
      guest_email: "suresh.kumar@example.com",
      guest_phone: "9876501234",
      affected_data_types: ["email", "phone", "address", "payment_info", "order_details"],
      notification_status: "pending",
    },
    {
      incident_id: unauthorizedAccessIncidentId,
      guest_email: "meena.patel@example.com",
      guest_phone: "9001122334",
      affected_data_types: ["email", "phone", "payment_info"],
      notification_status: "pending",
    },
    {
      incident_id: unauthorizedAccessIncidentId,
      guest_email: "arjun.reddy@example.com",
      guest_phone: "9556677889",
      affected_data_types: ["email", "phone", "address"],
      notification_status: "pending",
    },
  ];

  const allAffectedUsers = [...bulkExportUsers, ...unauthorizedAccessUsers];

  const { data: insertedUsers, error: usersError } = await supabase
    .from("incident_affected_users")
    .insert(allAffectedUsers)
    .select("id, guest_email, notification_status");

  if (usersError) {
    console.error("Failed to insert affected users:", usersError.message);
    process.exit(1);
  }

  console.log(`\nCreated ${insertedUsers!.length} affected users:`);

  console.log(`\n  Bulk Data Export incident (${bulkExportIncidentId}):`);
  for (const u of insertedUsers!.slice(0, bulkExportUsers.length)) {
    console.log(`    ${u.guest_email} [${u.notification_status}]`);
  }

  console.log(`\n  Unauthorized Access incident (${unauthorizedAccessIncidentId}):`);
  for (const u of insertedUsers!.slice(bulkExportUsers.length)) {
    console.log(`    ${u.guest_email} [${u.notification_status}]`);
  }

  console.log("\nDone! Open the Security Dashboard and click on either incident to see the Affected Users section.");
  console.log("The Affected Users section appears for incidents with high/critical severity or vendor/breach types.\n");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
