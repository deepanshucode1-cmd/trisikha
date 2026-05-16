import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { getNomineeClaimById, processNomineeClaim } from "@/lib/nominee";
import { sanitizeObject } from "@/lib/xss";
import { sendNomineeClaimProcessed } from "@/lib/email";

const processSchema = z.object({
  action: z.enum(["approve", "reject"]),
  adminNotes: z.string().optional(),
});

/**
 * GET /api/admin/nominee-claims/[id]
 *
 * Get a specific nominee claim by ID with nominee details.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const claim = await getNomineeClaimById(id);

    if (!claim) {
      return NextResponse.json(
        { error: "Nominee claim not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, claim });
  } catch (error) {
    logError(error as Error, {
      context: "admin_get_nominee_claim_error",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/nominee-claims/[id]
 *
 * Process a nominee claim (approve or reject).
 * On approve: executes the requested action(s) and transitions to `completed`.
 * On reject: transitions to `rejected`.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    if (!userRole || !["admin"].includes(userRole.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parseResult = processSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { action, adminNotes } = sanitizeObject(parseResult.data);

    // Get claim details for email notification
    const claim = await getNomineeClaimById(id);

    const result = await processNomineeClaim({
      claimId: id,
      action,
      adminId: user.id,
      adminNotes,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    // One email per terminal transition:
    //   approve + export (with or without deletion) → sendNomineeDataExport
    //     already fired inside processNomineeClaim with the JSON attached and
    //     deletion timing in the body. That IS the completion notification.
    //   approve + deletion only → generic "completed" email here.
    //   reject → generic "rejected" email here.
    if (claim) {
      const nomineeName = claim.nominee?.nominee_name || "Nominee";

      if (action === "approve" && result.deletionQueued && !result.exportSent) {
        sendNomineeClaimProcessed({
          nomineeEmail: claim.nominee_email,
          nomineeName,
          claimId: id,
          status: "completed",
          actionTaken:
            adminNotes ||
            "Deletion of the principal's data has been queued and will be completed within 24 hours.",
        }).catch((err) =>
          console.error("Failed to send nominee claim processed email:", err)
        );
      } else if (action === "reject") {
        sendNomineeClaimProcessed({
          nomineeEmail: claim.nominee_email,
          nomineeName,
          claimId: id,
          status: "rejected",
          rejectionReason: adminNotes || undefined,
        }).catch((err) =>
          console.error("Failed to send nominee claim processed email:", err)
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_process_nominee_claim_error",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
