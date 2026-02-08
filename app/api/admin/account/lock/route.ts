import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { lockAccount } from "@/lib/incident";
import { requireCsrf } from "@/lib/csrf";
import { adminShippingRateLimit, getClientIp } from "@/lib/rate-limit";
import { logAuth, logError } from "@/lib/logger";
import { sanitizeObject } from "@/lib/xss";

/**
 * POST /api/admin/account/lock
 * Lock an admin account (prevent login)
 */
export async function POST(request: Request) {
  try {
    // CSRF protection
    const csrfResult = await requireCsrf(request);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

    // Rate limiting
    const ip = getClientIp(request);
    const { success } = await adminShippingRateLimit.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { user } = await requireRole("admin");

    const body = sanitizeObject(await request.json());
    const { userId, reason, durationHours } = body as {
      userId: string;
      reason: string;
      durationHours?: number;
    };

    if (!userId || !reason) {
      return NextResponse.json(
        { error: "Missing userId or reason" },
        { status: 400 }
      );
    }

    // Prevent self-lockout
    if (userId === user.id) {
      return NextResponse.json(
        { error: "Cannot lock your own account" },
        { status: 400 }
      );
    }

    await lockAccount(userId, reason, durationHours || 24);

    logAuth("admin_lock_account", {
      adminId: user.id,
      targetUserId: userId,
      reason,
      durationHours: durationHours || 24,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(error as Error, { endpoint: "/api/admin/account/lock" });
    return NextResponse.json(
      { error: "Failed to lock account" },
      { status: 500 }
    );
  }
}
