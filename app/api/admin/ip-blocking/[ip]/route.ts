import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { logAuth, logError } from "@/lib/logger";
import { getIpHistory, isIpBlocked, isIpWhitelisted } from "@/lib/ip-blocking";

/**
 * GET /api/admin/ip-blocking/[ip]
 * Get details and history for a specific IP
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ip: string }> }
) {
  try {
    const { user } = await requireRole("admin");
    const { ip } = await params;

    // Decode the IP (it may be URL-encoded)
    const decodedIp = decodeURIComponent(ip);

    logAuth("admin_view_ip_details", { userId: user.id, ip: decodedIp });

    const [blockStatus, isWhitelisted, history] = await Promise.all([
      isIpBlocked(decodedIp),
      isIpWhitelisted(decodedIp),
      getIpHistory(decodedIp),
    ]);

    return NextResponse.json({
      ip: decodedIp,
      blockStatus,
      isWhitelisted,
      history,
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(error as Error, { endpoint: "/api/admin/ip-blocking/[ip]" });
    return NextResponse.json(
      { error: "Failed to fetch IP details" },
      { status: 500 }
    );
  }
}
