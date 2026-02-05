/**
 * Incident Affected Users Service
 * Implements Options C and D for tracking and notifying users affected by security incidents
 *
 * Option C: Query-based identification for vendor breaches (Razorpay/Shiprocket)
 * Option D: incident_affected_users table for tracking and notification
 */

import { createServiceClient } from "@/utils/supabase/service";
import { logError, logSecurityEvent } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";
import { sendBreachNotificationUser } from "@/lib/email";

// Types
export type VendorType = "razorpay" | "shiprocket";

export type AffectedDataType =
  | "email"
  | "phone"
  | "address"
  | "payment_info"
  | "order_details";

export type NotificationStatus = "pending" | "sent" | "failed" | "not_required";

export interface AffectedUser {
  id: string;
  incident_id: string;
  order_id: string | null;
  guest_email: string;
  guest_phone: string | null;
  affected_data_types: AffectedDataType[];
  notification_status: NotificationStatus;
  notified_at: string | null;
  notification_error: string | null;
  notification_attempts: number;
  created_at: string;
  updated_at: string;
}

export interface IdentifyAffectedUsersParams {
  incidentId: string;
  vendorType: VendorType;
  breachStartDate: Date;
  breachEndDate: Date;
  affectedDataTypes: AffectedDataType[];
}

export interface IdentifyAffectedUsersResult {
  success: boolean;
  usersIdentified: number;
  usersAdded: number;
  alreadyTracked: number;
  message: string;
}

/**
 * Data types exposed by each vendor
 */
const VENDOR_DATA_TYPES: Record<VendorType, AffectedDataType[]> = {
  razorpay: ["email", "phone", "payment_info"],
  shiprocket: ["email", "phone", "address", "order_details"],
};

/**
 * Option C: Query affected users for a vendor breach by date range
 * All orders use Razorpay (payment) and Shiprocket (shipping) - no vendor fields exist
 */
export async function queryAffectedUsersByVendor(params: {
  vendorType: VendorType;
  breachStartDate: Date;
  breachEndDate: Date;
}): Promise<
  {
    guest_email: string;
    guest_phone: string | null;
    order_id: string;
    created_at: string;
    total_amount: number;
  }[]
> {
  const supabase = createServiceClient();

  let query = supabase
    .from("orders")
    .select("id, guest_email, guest_phone, created_at, total_amount")
    .gte("created_at", params.breachStartDate.toISOString())
    .lte("created_at", params.breachEndDate.toISOString());

  // For Razorpay, only include orders with payment activity
  if (params.vendorType === "razorpay") {
    query = query.in("payment_status", ["paid", "pending"]);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    logError(error as Error, {
      context: "query_affected_users_by_vendor_failed",
      vendorType: params.vendorType,
    });
    return [];
  }

  // Return with renamed fields
  return (data || []).map((order) => ({
    guest_email: order.guest_email,
    guest_phone: order.guest_phone,
    order_id: order.id,
    created_at: order.created_at,
    total_amount: order.total_amount,
  }));
}

/**
 * Option D: Identify and add affected users to incident_affected_users table
 */
export async function identifyAffectedUsers(
  params: IdentifyAffectedUsersParams
): Promise<IdentifyAffectedUsersResult> {
  const supabase = createServiceClient();

  // Query affected users based on vendor and date range
  const affectedOrders = await queryAffectedUsersByVendor({
    vendorType: params.vendorType,
    breachStartDate: params.breachStartDate,
    breachEndDate: params.breachEndDate,
  });

  if (affectedOrders.length === 0) {
    return {
      success: true,
      usersIdentified: 0,
      usersAdded: 0,
      alreadyTracked: 0,
      message: "No affected users found in the specified date range",
    };
  }

  // Get unique emails (one user may have multiple orders)
  const uniqueUsers = new Map<
    string,
    { email: string; phone: string | null; orderIds: string[] }
  >();

  for (const order of affectedOrders) {
    const email = order.guest_email.toLowerCase();
    if (uniqueUsers.has(email)) {
      uniqueUsers.get(email)!.orderIds.push(order.order_id);
    } else {
      uniqueUsers.set(email, {
        email,
        phone: order.guest_phone,
        orderIds: [order.order_id],
      });
    }
  }

  // Check which users are already tracked for this incident
  const { data: existingUsers } = await supabase
    .from("incident_affected_users")
    .select("guest_email")
    .eq("incident_id", params.incidentId);

  const existingEmails = new Set(
    (existingUsers || []).map((u) => u.guest_email.toLowerCase())
  );

  // Prepare records to insert
  const newUsers = Array.from(uniqueUsers.values()).filter(
    (user) => !existingEmails.has(user.email)
  );

  if (newUsers.length === 0) {
    return {
      success: true,
      usersIdentified: uniqueUsers.size,
      usersAdded: 0,
      alreadyTracked: uniqueUsers.size,
      message: "All affected users are already tracked for this incident",
    };
  }

  // Insert new affected users
  const recordsToInsert = newUsers.map((user) => ({
    incident_id: params.incidentId,
    order_id: user.orderIds[0], // Link to first order
    guest_email: user.email,
    guest_phone: user.phone,
    affected_data_types: params.affectedDataTypes,
    notification_status: "pending" as NotificationStatus,
  }));

  const { error: insertError } = await supabase
    .from("incident_affected_users")
    .insert(recordsToInsert);

  if (insertError) {
    logError(insertError as Error, {
      context: "identify_affected_users_insert_failed",
      incidentId: params.incidentId,
    });
    return {
      success: false,
      usersIdentified: uniqueUsers.size,
      usersAdded: 0,
      alreadyTracked: existingEmails.size,
      message: "Failed to add affected users to tracking table",
    };
  }

  // Log for audit
  await logDataAccess({
    tableName: "incident_affected_users",
    operation: "INSERT",
    queryType: "bulk",
    rowCount: newUsers.length,
    endpoint: "/api/admin/incidents/affected-users",
    reason: `Identified ${newUsers.length} affected users for incident ${params.incidentId}`,
  });

  logSecurityEvent("affected_users_identified", {
    incidentId: params.incidentId,
    vendorType: params.vendorType,
    breachStartDate: params.breachStartDate.toISOString(),
    breachEndDate: params.breachEndDate.toISOString(),
    usersIdentified: uniqueUsers.size,
    usersAdded: newUsers.length,
  });

  return {
    success: true,
    usersIdentified: uniqueUsers.size,
    usersAdded: newUsers.length,
    alreadyTracked: existingEmails.size,
    message: `Successfully identified ${uniqueUsers.size} affected users, added ${newUsers.length} new records`,
  };
}

/**
 * Get affected users for an incident
 */
export async function getAffectedUsers(params: {
  incidentId: string;
  status?: NotificationStatus;
  limit?: number;
  offset?: number;
}): Promise<{ users: AffectedUser[]; total: number }> {
  const supabase = createServiceClient();

  let query = supabase
    .from("incident_affected_users")
    .select("*", { count: "exact" })
    .eq("incident_id", params.incidentId);

  if (params.status) {
    query = query.eq("notification_status", params.status);
  }

  query = query.order("created_at", { ascending: false });

  if (params.limit) {
    query = query.limit(params.limit);
  }

  if (params.offset) {
    query = query.range(
      params.offset,
      params.offset + (params.limit || 10) - 1
    );
  }

  const { data, error, count } = await query;

  if (error) {
    logError(error as Error, {
      context: "get_affected_users_failed",
      incidentId: params.incidentId,
    });
    return { users: [], total: 0 };
  }

  return {
    users: (data as AffectedUser[]) || [],
    total: count || 0,
  };
}

/**
 * Get affected users summary for an incident
 */
export async function getAffectedUsersSummary(incidentId: string): Promise<{
  total: number;
  pending: number;
  sent: number;
  failed: number;
  notRequired: number;
}> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("incident_affected_users")
    .select("notification_status")
    .eq("incident_id", incidentId);

  if (error) {
    logError(error as Error, {
      context: "get_affected_users_summary_failed",
      incidentId,
    });
    return { total: 0, pending: 0, sent: 0, failed: 0, notRequired: 0 };
  }

  const summary = {
    total: data?.length || 0,
    pending: 0,
    sent: 0,
    failed: 0,
    notRequired: 0,
  };

  for (const user of data || []) {
    switch (user.notification_status) {
      case "pending":
        summary.pending++;
        break;
      case "sent":
        summary.sent++;
        break;
      case "failed":
        summary.failed++;
        break;
      case "not_required":
        summary.notRequired++;
        break;
    }
  }

  return summary;
}

/**
 * Map data type codes to human-readable descriptions
 */
function formatAffectedDataTypes(types: AffectedDataType[]): string[] {
  const typeDescriptions: Record<AffectedDataType, string> = {
    email: "Email address",
    phone: "Phone number",
    address: "Shipping/billing address",
    payment_info: "Payment information (transaction IDs, not card details)",
    order_details: "Order details (items, amounts)",
  };

  return types.map((t) => typeDescriptions[t] || t);
}

/**
 * Get recommended actions based on affected data types
 */
function getRecommendedActions(types: AffectedDataType[]): string[] {
  const actions: string[] = [
    "Monitor your email for any suspicious activity",
  ];

  if (types.includes("payment_info")) {
    actions.push("Review your recent transactions for any unauthorized charges");
    actions.push("Contact your bank if you notice any suspicious activity");
  }

  if (types.includes("phone")) {
    actions.push("Be cautious of unexpected calls or SMS messages");
  }

  if (types.includes("address")) {
    actions.push("Be alert for any unexpected deliveries or mail");
  }

  actions.push("Contact us immediately if you notice anything unusual");

  return actions;
}

/**
 * Notify a single affected user
 */
export async function notifyAffectedUser(params: {
  affectedUserId: string;
  incidentDetails: {
    type: string;
    description: string;
    occurredAt: Date;
    vendorName?: string;
  };
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();

  // Get the affected user record
  const { data: user, error: fetchError } = await supabase
    .from("incident_affected_users")
    .select("*")
    .eq("id", params.affectedUserId)
    .single();

  if (fetchError || !user) {
    return { success: false, error: "Affected user record not found" };
  }

  if (user.notification_status === "sent") {
    return { success: false, error: "User already notified" };
  }

  const now = new Date();
  const affectedDataTypes = user.affected_data_types as AffectedDataType[];

  try {
    // Format incident description
    let incidentDescription = params.incidentDetails.description;
    if (params.incidentDetails.vendorName) {
      incidentDescription = `${params.incidentDetails.description} (${params.incidentDetails.vendorName})`;
    }

    // Send breach notification email using existing function signature
    await sendBreachNotificationUser(user.guest_email, {
      incidentType: incidentDescription,
      affectedData: formatAffectedDataTypes(affectedDataTypes),
      recommendedActions: getRecommendedActions(affectedDataTypes),
      orderId: user.order_id || undefined,
    });

    // Update status to sent
    await supabase
      .from("incident_affected_users")
      .update({
        notification_status: "sent",
        notified_at: now.toISOString(),
        notification_attempts: user.notification_attempts + 1,
        updated_at: now.toISOString(),
      })
      .eq("id", params.affectedUserId);

    logSecurityEvent("affected_user_notified", {
      affectedUserId: params.affectedUserId,
      incidentId: user.incident_id,
      email: user.guest_email,
    });

    return { success: true };
  } catch (err) {
    // Update status to failed
    await supabase
      .from("incident_affected_users")
      .update({
        notification_status: "failed",
        notification_error: (err as Error).message,
        notification_attempts: user.notification_attempts + 1,
        updated_at: now.toISOString(),
      })
      .eq("id", params.affectedUserId);

    logError(err as Error, {
      context: "notify_affected_user_failed",
      affectedUserId: params.affectedUserId,
    });

    return { success: false, error: (err as Error).message };
  }
}

/**
 * Notify all pending affected users for an incident
 */
export async function notifyAllAffectedUsers(params: {
  incidentId: string;
  incidentDetails: {
    type: string;
    description: string;
    occurredAt: Date;
    vendorName?: string;
  };
}): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const supabase = createServiceClient();

  // Get all pending affected users
  const { data: pendingUsers, error } = await supabase
    .from("incident_affected_users")
    .select("*")
    .eq("incident_id", params.incidentId)
    .eq("notification_status", "pending");

  if (error) {
    logError(error as Error, {
      context: "notify_all_affected_users_fetch_failed",
      incidentId: params.incidentId,
    });
    return { success: false, sent: 0, failed: 0, skipped: 0 };
  }

  const results = { sent: 0, failed: 0, skipped: 0 };

  for (const user of pendingUsers || []) {
    const result = await notifyAffectedUser({
      affectedUserId: user.id,
      incidentDetails: params.incidentDetails,
    });

    if (result.success) {
      results.sent++;
    } else if (result.error === "User already notified") {
      results.skipped++;
    } else {
      results.failed++;
    }
  }

  logSecurityEvent("bulk_notification_completed", {
    incidentId: params.incidentId,
    ...results,
  });

  return { success: true, ...results };
}

/**
 * Manually add an affected user to an incident
 */
export async function addAffectedUser(params: {
  incidentId: string;
  email: string;
  phone?: string;
  orderId?: string;
  affectedDataTypes: AffectedDataType[];
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createServiceClient();

  const normalizedEmail = params.email.toLowerCase().trim();

  // Check if already exists
  const { data: existing } = await supabase
    .from("incident_affected_users")
    .select("id")
    .eq("incident_id", params.incidentId)
    .eq("guest_email", normalizedEmail)
    .single();

  if (existing) {
    return { success: false, error: "User already tracked for this incident" };
  }

  const { data, error } = await supabase
    .from("incident_affected_users")
    .insert({
      incident_id: params.incidentId,
      guest_email: normalizedEmail,
      guest_phone: params.phone || null,
      order_id: params.orderId || null,
      affected_data_types: params.affectedDataTypes,
      notification_status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    logError(error as Error, {
      context: "add_affected_user_failed",
      incidentId: params.incidentId,
    });
    return { success: false, error: "Failed to add affected user" };
  }

  return { success: true, id: data.id };
}

/**
 * Remove an affected user from an incident
 */
export async function removeAffectedUser(
  affectedUserId: string
): Promise<{ success: boolean }> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("incident_affected_users")
    .delete()
    .eq("id", affectedUserId);

  if (error) {
    logError(error as Error, {
      context: "remove_affected_user_failed",
      affectedUserId,
    });
    return { success: false };
  }

  return { success: true };
}

/**
 * Get default affected data types for a vendor
 */
export function getVendorDataTypes(vendorType: VendorType): AffectedDataType[] {
  return VENDOR_DATA_TYPES[vendorType] || [];
}
