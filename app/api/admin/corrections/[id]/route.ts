import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { getFirstZodError } from "@/lib/errors";
import { processCorrectionRequest } from "@/lib/correction-request";
import { sanitizeObject } from "@/lib/xss";

const processSchema = z.object({
  action: z.enum(["approved", "rejected"]),
  adminNotes: z.string().optional(),
});

/**
 * GET /api/admin/corrections/[id]
 *
 * Get a specific correction request by ID
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

    const serviceSupabase = createServiceClient();
    const { data: request, error } = await serviceSupabase
      .from("correction_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !request) {
      return NextResponse.json(
        { error: "Correction request not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      request,
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_get_correction_request_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/corrections/[id]
 *
 * Process a correction request (approve or reject)
 * Body: { action: "approved" | "rejected", adminNotes?: string }
 */
export async function POST(
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

    // Parse and validate body
    const body = await req.json();
    const parseResult = processSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: getFirstZodError(parseResult.error), details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { action, adminNotes } = sanitizeObject(parseResult.data);

    const result = await processCorrectionRequest({
      requestId: id,
      action,
      adminId: user.id,
      adminNotes,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    logError(error as Error, {
      context: "admin_process_correction_request_error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
