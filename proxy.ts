import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isIpBlockedFast } from "@/lib/ip-blocking";

// Routes that should verify origin (state-changing operations)
const PROTECTED_API_ROUTES = [
  "/api/checkout",
  "/api/orders/cancel",
  "/api/orders/send-cancel-otp",
  "/api/seller/",
  "/api/products",
  "/api/auth/signup",
];

// Webhook routes that use signature verification instead
const WEBHOOK_ROUTES = [
  "/api/webhooks/",
];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_API_ROUTES.some((route) => pathname.startsWith(route));
}

function isWebhookRoute(pathname: string): boolean {
  return WEBHOOK_ROUTES.some((route) => pathname.startsWith(route));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip webhooks - they use signature verification
  if (isWebhookRoute(pathname)) {
    return NextResponse.next();
  }

  // --- IP Blocking Check ---
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const blockCheck = await isIpBlockedFast(ip);
  if (blockCheck.blocked) {
    return new NextResponse(
      JSON.stringify({
        error: "Access denied",
        reason: blockCheck.reason || "Your IP has been blocked due to suspicious activity",
        blockedUntil: blockCheck.blockedUntil,
        support: "contact@trishikhaorganics.com",
      }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "X-Blocked-IP": ip,
          ...(blockCheck.blockedUntil && {
            "X-Blocked-Until": blockCheck.blockedUntil,
          }),
        },
      }
    );
  }

  // Skip GET requests (read-only)
  if (request.method === "GET") {
    return NextResponse.next();
  }

  // Verify origin for protected routes
  if (isProtectedRoute(pathname)) {
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const host = request.headers.get("host");

    // Build allowed origins
    const allowedOrigins = [
      `https://${host}`,
      `http://${host}`,
    ];

    // Add configured domain if set
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      allowedOrigins.push(process.env.NEXT_PUBLIC_SITE_URL);
    }

    if(process.env.NEXT_PUBLIC_STAGING_SITE_URL){
      allowedOrigins.push(process.env.NEXT_PUBLIC_STAGING_SITE_URL);
    }

    // In development, allow localhost variants
    if (process.env.NODE_ENV === "development") {
      allowedOrigins.push("http://localhost:3000");
      allowedOrigins.push("http://127.0.0.1:3000");
    }

    // Check origin header first (most reliable)
    if (origin) {
      if (!allowedOrigins.includes(origin)) {
        return NextResponse.json(
          { error: "Forbidden" },
          { status: 403 }
        );
      }
    } else if (referer) {
      // Fallback to referer check
      const refererOrigin = new URL(referer).origin;
      if (!allowedOrigins.includes(refererOrigin)) {
        return NextResponse.json(
          { error: "Forbidden" },
          { status: 403 }
        );
      }
    }
    // If neither origin nor referer, allow (some legitimate requests may not have them)
    // The JSON-only API and SameSite cookies provide protection
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
  ],
};
