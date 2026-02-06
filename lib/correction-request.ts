/**
 * Correction Request Service
 * DPDP Rule 14 - Right to Correction
 *
 * Flow:
 * 1. Verified guest submits correction request scoped to a specific order
 * 2. System validates order belongs to guest and has status CONFIRMED
 * 3. Correction is applied immediately (no admin approval required)
 * 4. Request is recorded with status 'approved' for compliance audit trail
 * 5. All actions are audit-logged
 */

import { createServiceClient } from "@/utils/supabase/service";
import { logError, logSecurityEvent } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";

// Types
export type CorrectionStatus = "pending" | "approved" | "rejected";

export type CorrectionFieldName = "name" | "phone" | "address";

export interface CorrectionRequest {
  id: string;
  email: string;
  order_id: string;
  field_name: CorrectionFieldName;
  current_value: string;
  requested_value: string;
  status: CorrectionStatus;
  admin_notes: string | null;
  processed_at: string | null;
  processed_by: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCorrectionRequestParams {
  email: string;
  orderId: string;
  fieldName: CorrectionFieldName;
  currentValue: string;
  requestedValue: string;
  ip: string;
  userAgent?: string;
}

export interface ProcessCorrectionParams {
  requestId: string;
  action: "approved" | "rejected";
  adminId: string;
  adminNotes?: string;
}

// Map field_name to the actual column(s) in the orders table
// NOTE: Email is intentionally NOT correctable - it's the identity anchor used for OTP verification
const FIELD_TO_COLUMNS: Record<CorrectionFieldName, string[]> = {
  name: ["guest_first_name", "guest_last_name"],
  phone: ["guest_phone"],
  address: [
    "shipping_address",
    "shipping_city",
    "shipping_state",
    "shipping_pincode",
  ],
};

/**
 * Create a correction request and apply it immediately.
 * Corrections are scoped to a single CONFIRMED order — no admin approval needed.
 */
export async function createCorrectionRequest(
  params: CreateCorrectionRequestParams
): Promise<{ requestId: string; applied: true }> {
  const supabase = createServiceClient();
  const normalizedEmail = params.email.toLowerCase().trim();
  const now = new Date().toISOString();

  // Check for duplicate correction for the same field + order
  const { data: existing } = await supabase
    .from("correction_requests")
    .select("id")
    .eq("email", normalizedEmail)
    .eq("field_name", params.fieldName)
    .eq("order_id", params.orderId)
    .maybeSingle();

  if (existing) {
    throw new Error(
      `A correction for ${params.fieldName} on this order has already been submitted.`
    );
  }

  // Insert with status 'approved' — corrections are applied immediately
  const { data, error } = await supabase
    .from("correction_requests")
    .insert({
      email: normalizedEmail,
      order_id: params.orderId,
      field_name: params.fieldName,
      current_value: params.currentValue,
      requested_value: params.requestedValue,
      status: "approved",
      processed_at: now,
      ip_address: params.ip,
      user_agent: params.userAgent || null,
    })
    .select("id")
    .single();

  if (error) {
    logError(error as Error, {
      context: "create_correction_request_failed",
      email: normalizedEmail,
    });
    throw new Error("Failed to create correction request");
  }

  // Apply correction immediately
  const applyResult = await applyCorrectionToOrder({
    id: data.id,
    email: normalizedEmail,
    order_id: params.orderId,
    field_name: params.fieldName,
    current_value: params.currentValue,
    requested_value: params.requestedValue,
  });

  if (!applyResult.success) {
    // Rollback: delete the request if correction could not be applied
    await supabase.from("correction_requests").delete().eq("id", data.id);
    throw new Error(applyResult.message);
  }

  logSecurityEvent("correction_request_created_and_applied", {
    requestId: data.id,
    email: normalizedEmail,
    orderId: params.orderId,
    fieldName: params.fieldName,
    ip: params.ip,
  });

  return { requestId: data.id, applied: true };
}

/**
 * Get correction requests for a specific email
 */
export async function getCorrectionRequestsByEmail(
  email: string
): Promise<CorrectionRequest[]> {
  const supabase = createServiceClient();
  const normalizedEmail = email.toLowerCase().trim();

  const { data, error } = await supabase
    .from("correction_requests")
    .select("*")
    .eq("email", normalizedEmail)
    .order("created_at", { ascending: false });

  if (error) {
    logError(error as Error, {
      context: "get_correction_requests_by_email_failed",
      email: normalizedEmail,
    });
    return [];
  }

  return (data as CorrectionRequest[]) || [];
}

/**
 * Get all correction requests with optional filters (admin use)
 */
export async function getCorrectionRequests(params?: {
  status?: CorrectionStatus;
  email?: string;
  limit?: number;
  offset?: number;
}): Promise<{ requests: CorrectionRequest[]; total: number }> {
  const supabase = createServiceClient();

  let query = supabase
    .from("correction_requests")
    .select("*", { count: "exact" });

  if (params?.status) {
    query = query.eq("status", params.status);
  }

  if (params?.email) {
    query = query.ilike("email", `%${params.email}%`);
  }

  query = query.order("created_at", { ascending: false });

  if (params?.limit) {
    query = query.limit(params.limit);
  }

  if (params?.offset) {
    query = query.range(
      params.offset,
      params.offset + (params?.limit || 20) - 1
    );
  }

  const { data, error, count } = await query;

  if (error) {
    logError(error as Error, { context: "get_correction_requests_failed" });
    return { requests: [], total: 0 };
  }

  return {
    requests: (data as CorrectionRequest[]) || [],
    total: count || 0,
  };
}

/**
 * Process a correction request (admin override — reject only).
 * Corrections are auto-applied on creation, so this is only used
 * if an admin needs to retroactively reject a request for audit purposes.
 */
export async function processCorrectionRequest(
  params: ProcessCorrectionParams
): Promise<{ success: boolean; message: string }> {
  const supabase = createServiceClient();
  const now = new Date();

  // Fetch the request
  const { data: request, error: fetchError } = await supabase
    .from("correction_requests")
    .select("*")
    .eq("id", params.requestId)
    .single();

  if (fetchError || !request) {
    return {
      success: false,
      message: "Correction request not found",
    };
  }

  // Update the request status
  const { error: updateError } = await supabase
    .from("correction_requests")
    .update({
      status: params.action,
      admin_notes: params.adminNotes || null,
      processed_at: now.toISOString(),
      processed_by: params.adminId,
      updated_at: now.toISOString(),
    })
    .eq("id", params.requestId);

  if (updateError) {
    logError(updateError as Error, {
      context: "process_correction_request_update_failed",
      requestId: params.requestId,
    });
    return { success: false, message: "Failed to update correction request" };
  }

  logSecurityEvent("correction_request_processed", {
    requestId: params.requestId,
    action: params.action,
    email: (request as CorrectionRequest).email,
    fieldName: (request as CorrectionRequest).field_name,
    adminId: params.adminId,
  });

  return {
    success: true,
    message: `Correction request ${params.action}.`,
  };
}

/**
 * Apply a correction to a single order.
 * Validates that the order has status CONFIRMED before applying.
 */
async function applyCorrectionToOrder(
  request: Pick<CorrectionRequest, "id" | "email" | "order_id" | "field_name" | "current_value" | "requested_value">
): Promise<{ success: boolean; message: string }> {
  const supabase = createServiceClient();
  const columns = FIELD_TO_COLUMNS[request.field_name];

  if (!columns) {
    return { success: false, message: `Unknown field: ${request.field_name}` };
  }

  // Verify order exists and has CONFIRMED status
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_status")
    .eq("id", request.order_id)
    .single();

  if (orderError || !order) {
    return { success: false, message: "Order not found" };
  }

  if (order.order_status !== "CONFIRMED") {
    return {
      success: false,
      message: `Corrections are only allowed for orders with status CONFIRMED. This order has status ${order.order_status}.`,
    };
  }

  // Build the update object based on field type
  let updateData: Record<string, string> = {};

  switch (request.field_name) {
    case "name": {
      // requested_value expected as "FirstName LastName"
      const parts = request.requested_value.trim().split(/\s+/);
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";
      updateData = {
        guest_first_name: firstName,
        guest_last_name: lastName,
      };
      break;
    }
    case "phone":
      updateData = {
        guest_phone: request.requested_value.trim(),
      };
      break;
    case "address":
      // requested_value expected as JSON: {"address":"...","city":"...","state":"...","pincode":"..."}
      try {
        const parsed = JSON.parse(request.requested_value);
        if (parsed.address) updateData.shipping_address = parsed.address;
        if (parsed.city) updateData.shipping_city = parsed.city;
        if (parsed.state) updateData.shipping_state = parsed.state;
        if (parsed.pincode) updateData.shipping_pincode = parsed.pincode;
      } catch {
        return {
          success: false,
          message:
            'Invalid address format. Expected JSON: {"address":"...","city":"...","state":"...","pincode":"..."}',
        };
      }
      break;
  }

  // Apply update to the specific order
  const { data: updatedOrders, error } = await supabase
    .from("orders")
    .update(updateData)
    .eq("id", request.order_id)
    .select("id");

  if (error) {
    logError(error as Error, {
      context: "apply_correction_to_order_failed",
      requestId: request.id,
      email: request.email,
      orderId: request.order_id,
    });
    return { success: false, message: "Failed to apply correction to order" };
  }

  const rowCount = updatedOrders?.length || 0;

  // Audit log
  await logDataAccess({
    tableName: "orders",
    operation: "UPDATE",
    queryType: "single",
    rowCount,
    userId: "system:guest_correction",
    endpoint: "/api/guest/correct-data",
    oldData: { [request.field_name]: request.current_value },
    newData: { [request.field_name]: request.requested_value },
    reason: `DPDP right to correction - ${request.field_name} updated for ${request.email} on order ${request.order_id} (request ${request.id})`,
  });

  return {
    success: true,
    message: `Correction applied to order`,
  };
}

/**
 * Get correction request stats (admin use)
 */
export async function getCorrectionRequestStats(): Promise<{
  pending: number;
  approved: number;
  rejected: number;
}> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("correction_requests")
    .select("status");

  if (error) {
    logError(error as Error, {
      context: "get_correction_request_stats_failed",
    });
    return { pending: 0, approved: 0, rejected: 0 };
  }

  const stats = { pending: 0, approved: 0, rejected: 0 };

  for (const req of data || []) {
    if (req.status === "pending") stats.pending++;
    else if (req.status === "approved") stats.approved++;
    else if (req.status === "rejected") stats.rejected++;
  }

  return stats;
}
