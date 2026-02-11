import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { getFirstZodError } from "@/lib/errors";
import { requireCsrf } from "@/lib/csrf";
import { getGrievanceById, updateGrievance } from "@/lib/grievance";
import { sanitizeObject } from "@/lib/xss";
import {
  sendGrievanceStatusUpdate,
  sendGrievanceResolved,
} from "@/lib/email";

const updateSchema = z.object({
  status: z
    .enum(["open", "in_progress", "resolved", "closed"])
    .optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  adminNotes: z.string().optional(),
  resolutionNotes: z.string().optional(),
});

/**
 * GET /api/admin/grievances/[id]
 *
 * Get a specific grievance by ID (admin only)
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check admin authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userRole } = await supabase
      .from("user_role")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userRole || !["admin", "super_admin"].includes(userRole.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const grievance = await getGrievanceById(id);

    if (!grievance) {
      return NextResponse.json(
        { error: "Grievance not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      grievance,
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_get_grievance_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/grievances/[id]
 *
 * Update a grievance (admin only)
 * Body: { status?, priority?, adminNotes?, resolutionNotes? }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // CSRF protection
    const csrfResult = await requireCsrf(req);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

    const { id } = await params;
    const supabase = await createClient();

    // Check admin authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userRole } = await supabase
      .from("user_role")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userRole || !["admin", "super_admin"].includes(userRole.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse and validate body
    const body = await req.json();
    const parseResult = updateSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: getFirstZodError(parseResult.error), details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const sanitizedData = sanitizeObject(parseResult.data);

    // Get current grievance for email notification
    const currentGrievance = await getGrievanceById(id);
    if (!currentGrievance) {
      return NextResponse.json(
        { error: "Grievance not found" },
        { status: 404 }
      );
    }

    const result = await updateGrievance({
      grievanceId: id,
      status: sanitizedData.status,
      priority: sanitizedData.priority,
      adminNotes: sanitizedData.adminNotes,
      resolutionNotes: sanitizedData.resolutionNotes,
      adminId: user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    // Send email notifications (non-blocking)
    if (sanitizedData.status === "resolved" && sanitizedData.resolutionNotes) {
      sendGrievanceResolved({
        email: currentGrievance.email,
        grievanceId: id,
        subject: currentGrievance.subject,
        resolutionNotes: sanitizedData.resolutionNotes,
      }).catch(() => {});
    } else if (
      sanitizedData.status &&
      sanitizedData.status !== currentGrievance.status
    ) {
      sendGrievanceStatusUpdate({
        email: currentGrievance.email,
        grievanceId: id,
        subject: currentGrievance.subject,
        newStatus: sanitizedData.status,
        adminNotes: sanitizedData.adminNotes,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_update_grievance_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
