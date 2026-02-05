import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logError, logSecurityEvent } from "@/lib/logger";
import {
  identifyAffectedUsers,
  getAffectedUsers,
  getAffectedUsersSummary,
  addAffectedUser,
  getVendorDataTypes,
  type VendorType,
  type AffectedDataType,
  type NotificationStatus,
} from "@/lib/incident-affected-users";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/incidents/[id]/affected-users
 *
 * Get affected users for an incident with optional status filter
 * Query params: status, limit, offset
 */
export async function GET(req: Request, { params }: RouteParams) {
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

    // Verify incident exists
    const { data: incident } = await supabase
      .from("security_incidents")
      .select("id, incident_type")
      .eq("id", incidentId)
      .single();

    if (!incident) {
      return NextResponse.json(
        { error: "Incident not found" },
        { status: 404 }
      );
    }

    // Parse query params
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as NotificationStatus | null;
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Get affected users
    const { users, total } = await getAffectedUsers({
      incidentId,
      status: status || undefined,
      limit,
      offset,
    });

    // Get summary
    const summary = await getAffectedUsersSummary(incidentId);

    return NextResponse.json({
      success: true,
      incidentId,
      users,
      total,
      limit,
      offset,
      summary,
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_get_affected_users_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/incidents/[id]/affected-users
 *
 * Identify affected users for a vendor breach incident (Option C)
 * Or manually add a single affected user
 *
 * Body for vendor identification:
 * {
 *   action: "identify",
 *   vendorType: "razorpay" | "shiprocket",
 *   breachStartDate: "2026-01-01",
 *   breachEndDate: "2026-01-15",
 *   affectedDataTypes?: ["email", "phone", "payment_info"]
 * }
 *
 * Body for manual add:
 * {
 *   action: "add",
 *   email: "user@example.com",
 *   phone?: "1234567890",
 *   orderId?: "uuid",
 *   affectedDataTypes: ["email", "phone"]
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

    // Verify incident exists
    const { data: incident } = await supabase
      .from("security_incidents")
      .select("id, incident_type")
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

    // Action: Identify users for vendor breach (Option C)
    if (action === "identify") {
      const { vendorType, breachStartDate, breachEndDate, affectedDataTypes } =
        body;

      if (!vendorType || !["razorpay", "shiprocket"].includes(vendorType)) {
        return NextResponse.json(
          { error: "vendorType must be 'razorpay' or 'shiprocket'" },
          { status: 400 }
        );
      }

      if (!breachStartDate || !breachEndDate) {
        return NextResponse.json(
          { error: "breachStartDate and breachEndDate are required" },
          { status: 400 }
        );
      }

      const startDate = new Date(breachStartDate);
      const endDate = new Date(breachEndDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid date format" },
          { status: 400 }
        );
      }

      if (startDate > endDate) {
        return NextResponse.json(
          { error: "breachStartDate must be before breachEndDate" },
          { status: 400 }
        );
      }

      // Use default data types for vendor if not specified
      const dataTypes: AffectedDataType[] =
        affectedDataTypes && affectedDataTypes.length > 0
          ? affectedDataTypes
          : getVendorDataTypes(vendorType as VendorType);

      const result = await identifyAffectedUsers({
        incidentId,
        vendorType: vendorType as VendorType,
        breachStartDate: startDate,
        breachEndDate: endDate,
        affectedDataTypes: dataTypes,
      });

      logSecurityEvent("admin_identified_affected_users", {
        adminId: user.id,
        incidentId,
        vendorType,
        breachStartDate,
        breachEndDate,
        result,
      });

      return NextResponse.json({
        success: result.success,
        message: result.message,
        usersIdentified: result.usersIdentified,
        usersAdded: result.usersAdded,
        alreadyTracked: result.alreadyTracked,
      });
    }

    // Action: Manually add a user
    if (action === "add") {
      const { email, phone, orderId, affectedDataTypes } = body;

      if (!email) {
        return NextResponse.json(
          { error: "email is required" },
          { status: 400 }
        );
      }

      if (!affectedDataTypes || affectedDataTypes.length === 0) {
        return NextResponse.json(
          { error: "affectedDataTypes array is required" },
          { status: 400 }
        );
      }

      const result = await addAffectedUser({
        incidentId,
        email,
        phone,
        orderId,
        affectedDataTypes,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      logSecurityEvent("admin_added_affected_user", {
        adminId: user.id,
        incidentId,
        email,
        affectedUserId: result.id,
      });

      return NextResponse.json({
        success: true,
        id: result.id,
        message: "Affected user added successfully",
      });
    }

    return NextResponse.json(
      { error: "action must be 'identify' or 'add'" },
      { status: 400 }
    );
  } catch (error) {
    logError(error as Error, {
      context: "admin_post_affected_users_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
