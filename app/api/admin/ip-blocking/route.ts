import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { logAuth, logError } from "@/lib/logger";
import { getBlockedIps, adminBlockIp, unblockIp } from "@/lib/ip-blocking";
import { sanitizeObject } from "@/lib/xss";

/**
 * GET /api/admin/ip-blocking
 * List blocked IPs with optional filters
 */
export async function GET(request: Request) {
  try {
    const { user } = await requireRole("admin");
    logAuth("admin_view_blocked_ips", { userId: user.id });

    const { searchParams } = new URL(request.url);
    const blockType = searchParams.get("type") as "temporary" | "permanent" | null;
    const isActive = searchParams.get("active") !== "false";
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const { blocks, total } = await getBlockedIps({
      blockType: blockType || undefined,
      isActive,
      limit,
      offset,
    });

    return NextResponse.json({ blocks, total });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(error as Error, { endpoint: "/api/admin/ip-blocking" });
    return NextResponse.json(
      { error: "Failed to fetch blocked IPs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/ip-blocking
 * Block an IP manually
 */
export async function POST(request: Request) {
  try {
    const csrfResult = await requireCsrf(request);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

    const { user } = await requireRole("admin");

    const body = sanitizeObject(await request.json());
    const { ip, blockType, reason, durationMinutes } = body;

    if (!ip || !blockType || !reason) {
      return NextResponse.json(
        { error: "Missing required fields: ip, blockType, reason" },
        { status: 400 }
      );
    }

    if (blockType !== "temporary" && blockType !== "permanent") {
      return NextResponse.json(
        { error: "Invalid blockType. Must be 'temporary' or 'permanent'" },
        { status: 400 }
      );
    }

    if (blockType === "temporary" && !durationMinutes) {
      return NextResponse.json(
        { error: "durationMinutes is required for temporary blocks" },
        { status: 400 }
      );
    }

    const result = await adminBlockIp({
      ip,
      blockType,
      reason,
      adminId: user.id,
      durationMinutes: blockType === "temporary" ? durationMinutes : undefined,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    logAuth("admin_blocked_ip", {
      userId: user.id,
      ip,
      blockType,
      blockId: result.blockId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(error as Error, { endpoint: "/api/admin/ip-blocking POST" });
    return NextResponse.json({ error: "Failed to block IP" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/ip-blocking
 * Unblock an IP
 */
export async function DELETE(request: Request) {
  try {
    const csrfResult = await requireCsrf(request);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

    const { user } = await requireRole("admin");

    const { searchParams } = new URL(request.url);
    const ip = searchParams.get("ip");

    if (!ip) {
      return NextResponse.json({ error: "IP address required" }, { status: 400 });
    }

    const success = await unblockIp(ip, user.id);

    if (!success) {
      return NextResponse.json({ error: "Failed to unblock IP" }, { status: 500 });
    }

    logAuth("admin_unblocked_ip", { userId: user.id, ip });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(error as Error, { endpoint: "/api/admin/ip-blocking DELETE" });
    return NextResponse.json({ error: "Failed to unblock IP" }, { status: 500 });
  }
}
