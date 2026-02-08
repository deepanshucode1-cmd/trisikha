import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { updateVendorBreachStatus } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { z } from "zod";
import { sanitizeObject } from "@/lib/xss";

// Validation schema for updating a vendor breach
const updateBreachSchema = z.object({
  remediationStatus: z.enum(["pending", "in_progress", "completed"]).optional(),
  weNotifiedDpbAt: z.string().optional(),
  usersNotifiedAt: z.string().optional(),
  containmentActions: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

// PATCH - Update vendor breach status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: breachId } = await params;
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
    const validation = updateBreachSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const data = sanitizeObject(validation.data);
    const success = await updateVendorBreachStatus(breachId, {
      remediationStatus: data.remediationStatus,
      weNotifiedDpbAt: data.weNotifiedDpbAt ? new Date(data.weNotifiedDpbAt) : undefined,
      usersNotifiedAt: data.usersNotifiedAt ? new Date(data.usersNotifiedAt) : undefined,
      containmentActions: data.containmentActions,
      notes: data.notes,
    });

    if (!success) {
      return NextResponse.json({ error: "Failed to update breach" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Vendor breach updated successfully"
    });
  } catch (err) {
    logError(err as Error, { context: "update_vendor_breach_error" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET - Get single vendor breach details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: breachId } = await params;
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

    const { data: breach, error } = await supabase
      .from("vendor_breach_log")
      .select("*")
      .eq("id", breachId)
      .single();

    if (error || !breach) {
      return NextResponse.json({ error: "Breach not found" }, { status: 404 });
    }

    return NextResponse.json({ breach });
  } catch (err) {
    logError(err as Error, { context: "get_vendor_breach_error" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
