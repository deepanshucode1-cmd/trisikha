import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { unlockAccount } from "@/lib/incident";
import { requireCsrf } from "@/lib/csrf";
import { adminShippingRateLimit, getClientIp } from "@/lib/rate-limit";
import { logAuth, logError } from "@/lib/logger";

/**
 * POST /api/admin/account/unlock
 * Unlock a locked admin account
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

    const body = await request.json();
    const { userId } = body as { userId: string };

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400 }
      );
    }

    await unlockAccount(userId, user.id);

    logAuth("admin_unlock_account", {
      adminId: user.id,
      targetUserId: userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(error as Error, { endpoint: "/api/admin/account/unlock" });
    return NextResponse.json(
      { error: "Failed to unlock account" },
      { status: 500 }
    );
  }
}
