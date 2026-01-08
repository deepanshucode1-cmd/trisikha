import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip webhooks - they use signature verification
  if (isWebhookRoute(pathname)) {
    return NextResponse.next();
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
