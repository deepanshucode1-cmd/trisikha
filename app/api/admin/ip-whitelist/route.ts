import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { logAuth, logError } from "@/lib/logger";
import { getWhitelist, addToWhitelist, removeFromWhitelist } from "@/lib/ip-blocking";
import { sanitizeObject } from "@/lib/xss";

const VALID_CATEGORIES = [
  "payment_gateway",
  "webhook_provider",
  "internal",
  "monitoring",
  "admin",
] as const;

type WhitelistCategory = (typeof VALID_CATEGORIES)[number];

/**
 * GET /api/admin/ip-whitelist
 * List whitelisted IPs
 */
export async function GET(request: Request) {
  try {
    const { user } = await requireRole("admin");
    logAuth("admin_view_whitelist", { userId: user.id });

    const whitelist = await getWhitelist();

    return NextResponse.json({ whitelist });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(error as Error, { endpoint: "/api/admin/ip-whitelist" });
    return NextResponse.json(
      { error: "Failed to fetch whitelist" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/ip-whitelist
 * Add IP to whitelist
 */
export async function POST(request: Request) {
  try {
    const csrfResult = await requireCsrf(request);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

    const { user } = await requireRole("admin");

    const body = sanitizeObject(await request.json());
    const { ip, cidrRange, label, category, notes } = body;

    if (!ip || !label || !category) {
      return NextResponse.json(
        { error: "Missing required fields: ip, label, category" },
        { status: 400 }
      );
    }

    if (!VALID_CATEGORIES.includes(category as WhitelistCategory)) {
      return NextResponse.json(
        {
          error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const success = await addToWhitelist({
      ip,
      cidrRange,
      label,
      category: category as WhitelistCategory,
      addedBy: user.id,
      notes,
    });

    if (!success) {
      return NextResponse.json(
        { error: "Failed to add to whitelist" },
        { status: 500 }
      );
    }

    logAuth("admin_added_whitelist", { userId: user.id, ip, label, category });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(error as Error, { endpoint: "/api/admin/ip-whitelist POST" });
    return NextResponse.json(
      { error: "Failed to add to whitelist" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/ip-whitelist
 * Remove IP from whitelist
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

    const success = await removeFromWhitelist(ip, user.id);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to remove from whitelist" },
        { status: 500 }
      );
    }

    logAuth("admin_removed_whitelist", { userId: user.id, ip });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(error as Error, { endpoint: "/api/admin/ip-whitelist DELETE" });
    return NextResponse.json(
      { error: "Failed to remove from whitelist" },
      { status: 500 }
    );
  }
}
