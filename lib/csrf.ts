import { cookies } from "next/headers";
import crypto from "crypto";

const CSRF_TOKEN_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_SECRET = process.env.CSRF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32) || "default-csrf-secret-change-me";

/**
 * Generate a CSRF token
 * Uses HMAC to create a token that can be verified without storing state
 */
export function generateCsrfToken(): string {
  const timestamp = Date.now().toString();
  const randomPart = crypto.randomBytes(16).toString("hex");
  const data = `${timestamp}:${randomPart}`;
  const signature = crypto
    .createHmac("sha256", CSRF_SECRET)
    .update(data)
    .digest("hex");

  return `${data}:${signature}`;
}

/**
 * Verify a CSRF token
 */
export function verifyCsrfToken(token: string): boolean {
  if (!token) return false;

  const parts = token.split(":");
  if (parts.length !== 3) return false;

  const [timestamp, randomPart, providedSignature] = parts;

  // Check if token is not too old (24 hours)
  const tokenAge = Date.now() - parseInt(timestamp, 10);
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  if (tokenAge > maxAge || tokenAge < 0) {
    return false;
  }

  // Verify signature
  const data = `${timestamp}:${randomPart}`;
  const expectedSignature = crypto
    .createHmac("sha256", CSRF_SECRET)
    .update(data)
    .digest("hex");

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Set CSRF token in cookie
 */
export async function setCsrfCookie(): Promise<string> {
  const token = generateCsrfToken();
  const cookieStore = await cookies();

  cookieStore.set(CSRF_TOKEN_NAME, token, {
    httpOnly: false, // Client needs to read this
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 24 * 60 * 60, // 24 hours
  });

  return token;
}

/**
 * Get CSRF token from cookie
 */
export async function getCsrfTokenFromCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(CSRF_TOKEN_NAME)?.value;
}

/**
 * Validate CSRF token from request
 * Compares the token in the header with the token in the cookie
 */
export async function validateCsrfRequest(request: Request): Promise<boolean> {
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  const cookieToken = await getCsrfTokenFromCookie();

  if (!headerToken || !cookieToken) {
    return false;
  }

  // Both tokens should be valid and match
  if (!verifyCsrfToken(headerToken) || !verifyCsrfToken(cookieToken)) {
    return false;
  }

  // Tokens should be the same
  return headerToken === cookieToken;
}

/**
 * CSRF validation wrapper for API routes
 * Use this for state-changing operations (POST, PUT, DELETE, PATCH)
 */
export async function requireCsrf(request: Request): Promise<{ valid: boolean; error?: string }> {
  // Skip CSRF for webhooks (they use signature verification)
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/api/webhooks/")) {
    return { valid: true };
  }

  // Skip CSRF for GET and HEAD requests
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { valid: true };
  }

  const isValid = await validateCsrfRequest(request);

  if (!isValid) {
    return {
      valid: false,
      error: "Invalid or missing CSRF token"
    };
  }

  return { valid: true };
}

export { CSRF_TOKEN_NAME, CSRF_HEADER_NAME };
