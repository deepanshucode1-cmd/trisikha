import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logError, logSecurityEvent } from "@/lib/logger";
import { getNomineeClaimById } from "@/lib/nominee";
import { getClaimDocumentUrl } from "@/lib/nominee-storage";

/**
 * GET /api/admin/nominee-claims/[id]/document
 *
 * Get a signed URL for downloading the claim's proof document.
 * URL expires in 60 seconds.
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

    if (claim.document_path === "deleted") {
      return NextResponse.json(
        { error: "Document has been deleted per retention policy." },
        { status: 410 }
      );
    }

    const { signedUrl } = await getClaimDocumentUrl(claim.document_path);

    logSecurityEvent("nominee_document_accessed", {
      claimId: id,
      adminId: user.id,
      documentPath: claim.document_path,
    });

    return NextResponse.json({
      success: true,
      signedUrl,
      filename: claim.document_filename,
      contentType: claim.document_content_type,
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_get_nominee_document_error",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
