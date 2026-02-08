import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import { logVendorBreach } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { z } from "zod";
import { sanitizeObject } from "@/lib/xss";

// Validation schema for creating a vendor breach
const createBreachSchema = z.object({
  vendorName: z.enum(["razorpay", "shiprocket", "supabase", "other"]),
  customVendorName: z.string().optional(),
  breachDescription: z.string().min(10, "Description must be at least 10 characters"),
  affectedDataTypes: z.array(z.string()).min(1, "At least one data type required"),
  breachOccurredAt: z.string().optional(),
  affectedUserCount: z.number().int().positive().optional(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  containmentActions: z.array(z.string()).optional(),
  vendorReferenceId: z.string().optional(),
  notes: z.string().optional(),
});

// GET - List vendor breaches
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    const { data: userRole } = await supabase
      .from("user_role")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userRole || userRole.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status"); // pending, in_progress, completed
    const vendor = searchParams.get("vendor");
    const limit = parseInt(searchParams.get("limit") || "50");

    // Use service client for reading
    const serviceClient = createServiceClient();
    let query = serviceClient
      .from("vendor_breach_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("remediation_status", status);
    }
    if (vendor) {
      query = query.eq("vendor_name", vendor);
    }

    const { data: breaches, error } = await query;

    if (error) {
      logError(error as Error, { context: "get_vendor_breaches" });
      return NextResponse.json({ error: "Failed to fetch breaches" }, { status: 500 });
    }

    return NextResponse.json({ breaches: breaches || [] });
  } catch (err) {
    logError(err as Error, { context: "get_vendor_breaches_error" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Create a new vendor breach entry
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    const { data: userRole } = await supabase
      .from("user_role")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userRole || userRole.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validation = createBreachSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const data = sanitizeObject(validation.data);
    const vendorName = data.vendorName === "other" && data.customVendorName
      ? data.customVendorName
      : data.vendorName;

    // Log the vendor breach using the existing function
    const breachId = await logVendorBreach({
      vendorName,
      breachDescription: data.breachDescription,
      affectedDataTypes: data.affectedDataTypes,
      breachOccurredAt: data.breachOccurredAt ? new Date(data.breachOccurredAt) : undefined,
      vendorNotifiedUsAt: new Date(), // Now
      affectedUserCount: data.affectedUserCount,
      riskLevel: data.riskLevel,
      containmentActions: data.containmentActions,
      vendorReferenceId: data.vendorReferenceId,
      notes: data.notes,
    });

    if (!breachId) {
      return NextResponse.json({ error: "Failed to create breach entry" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      breachId,
      message: "Vendor breach logged successfully"
    });
  } catch (err) {
    logError(err as Error, { context: "create_vendor_breach_error" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
