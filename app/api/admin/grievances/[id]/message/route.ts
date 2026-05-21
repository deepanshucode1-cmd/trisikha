import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { getFirstZodError } from "@/lib/errors";
import { requireCsrf } from "@/lib/csrf";
import { getGrievanceById, postAdminMessage } from "@/lib/grievance";
import { sanitizeObject } from "@/lib/xss";
import {
  sendGrievanceClosureProposed,
  sendGrievanceAdminReply,
} from "@/lib/email";

const messageSchema = z.object({
  body: z.string().min(1).max(5000),
  proposesClose: z.boolean(),
});

/**
 * POST /api/admin/grievances/[id]/message
 *
 * Admin posts a message on a grievance. When `proposesClose` is true, the
 * message is a closure proposal and transitions the grievance to
 * `awaiting_user_response` (T4a/T4b/T4c). Otherwise it's a clarification
 * (T2/T3/T9). See docs/grievance-acceptance-workflow-plan.md §3.2.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfResult = await requireCsrf(req);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

    const { id } = await params;
    const supabase = await createClient();

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

    const body = await req.json();
    const parseResult = messageSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: getFirstZodError(parseResult.error),
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const sanitized = sanitizeObject(parseResult.data);

    const currentGrievance = await getGrievanceById(id);
    if (!currentGrievance) {
      return NextResponse.json(
        { error: "Grievance not found" },
        { status: 404 }
      );
    }

    const result = await postAdminMessage({
      grievanceId: id,
      adminId: user.id,
      body: sanitized.body,
      proposesClose: sanitized.proposesClose,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    // Email notifications are best-effort — local state is already updated.
    if (sanitized.proposesClose) {
      sendGrievanceClosureProposed({
        email: currentGrievance.email,
        grievanceId: id,
        subject: currentGrievance.subject,
        proposalBody: sanitized.body,
      }).catch(() => {});
    } else {
      sendGrievanceAdminReply({
        email: currentGrievance.email,
        grievanceId: id,
        subject: currentGrievance.subject,
        replyBody: sanitized.body,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    logError(error as Error, {
      context: "admin_post_grievance_message_error",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
