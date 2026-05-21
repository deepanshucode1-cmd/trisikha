import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { getFirstZodError } from "@/lib/errors";
import { requireCsrf } from "@/lib/csrf";
import {
  getGrievanceById,
  updateGrievance,
  forceClose,
} from "@/lib/grievance";
import { sanitizeObject } from "@/lib/xss";
import { sendGrievanceForceClosed } from "@/lib/email";

// PATCH narrowed per docs/grievance-acceptance-workflow-plan.md §3.2:
// - status writes removed (transitions happen via the /message endpoint,
//   /accept and /dispute guest endpoints, and the silence cron)
// - adminNotes / resolutionNotes removed (the message thread is the
//   single source of truth for per-grievance text)
const updateSchema = z
  .object({
    priority: z.enum(["low", "medium", "high"]).optional(),
    forceClose: z.literal(true).optional(),
    forceCloseReason: z.string().min(20).max(2000).optional(),
  })
  .refine(
    (v) => !v.forceClose || (v.forceCloseReason && v.forceCloseReason.trim().length >= 20),
    {
      message: "forceClose requires forceCloseReason (≥20 characters)",
      path: ["forceCloseReason"],
    }
  )
  .refine((v) => v.priority || v.forceClose, {
    message: "Provide either priority or forceClose",
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

    // Admin detail view renders the conversation thread inline.
    const grievance = await getGrievanceById(id, { withMessages: true });

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

    const currentGrievance = await getGrievanceById(id);
    if (!currentGrievance) {
      return NextResponse.json(
        { error: "Grievance not found" },
        { status: 404 }
      );
    }

    // Force-close path (T8). Reason is admin-authored audit copy and is
    // NOT anonymised by the daily cron (see plan §4.3).
    if (sanitizedData.forceClose) {
      const result = await forceClose({
        grievanceId: id,
        adminId: user.id,
        reason: sanitizedData.forceCloseReason!,
      });
      if (!result.success) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }
      sendGrievanceForceClosed({
        email: currentGrievance.email,
        grievanceId: id,
        subject: currentGrievance.subject,
        reason: sanitizedData.forceCloseReason!,
      }).catch(() => {});
      return NextResponse.json({ success: true, message: result.message });
    }

    // Priority-only update (admin triage).
    if (sanitizedData.priority) {
      const result = await updateGrievance({
        grievanceId: id,
        priority: sanitizedData.priority,
        adminId: user.id,
      });
      if (!result.success) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: result.message });
    }

    // Refine guards above should make this unreachable, but defend anyway.
    return NextResponse.json(
      { error: "Nothing to update" },
      { status: 400 }
    );
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
