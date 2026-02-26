/**
 * Client-safe XSS prevention utilities
 * These can be used in both client and server components
 */

/**
 * HTML escape utility to prevent XSS in HTML content
 * Use this for any user-provided content embedded in HTML
 */
export function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Returns the set of allowed URL domains from the ALLOWED_URL_DOMAINS env var.
 * Called on every invocation so the env var can be changed between tests.
 */
function getAllowedDomains(): Set<string> {
  const raw = process.env.NEXT_PUBLIC_ALLOWED_URL_DOMAINS || process.env.ALLOWED_URL_DOMAINS || "";
  return new Set(
    raw.split(",").map((d) => {
      const trimmed = d.trim().toLowerCase();
      try {
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          return new URL(trimmed).hostname;
        }
        return trimmed;
      } catch {
        return trimmed;
      }
    }).filter(Boolean)
  );
}

/**
 * Sanitize URL to prevent javascript: and other dangerous protocols.
 * Only allows http and https URLs whose hostname matches ALLOWED_URL_DOMAINS.
 * Fails closed (returns "") when no domains are configured.
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    const allowed = getAllowedDomains();
    if (allowed.size === 0) return ""; // fail closed — no domains configured
    const host = parsed.hostname.toLowerCase();
    const ok = [...allowed].some((d) =>
      d.startsWith("*.") ? host === d.slice(2) || host.endsWith("." + d.slice(2)) : host === d
    );
    return ok ? url : "";
  } catch {
    return "";
  }
}

/**
 * Check if a URL is safe (http/https only)
 * Returns boolean instead of sanitized URL
 */
export function isUrlSafe(url: string | null | undefined): boolean {
  return sanitizeUrl(url) !== "";
}

/**
 * Strip all HTML tags from a string, preserving text content.
 * Also removes null bytes and collapses extra whitespace left by tag removal.
 *
 * Examples:
 *   "<b>John</b>"                    -> "John"
 *   "<script>alert(1)</script>"      -> "alert(1)"
 *   "<img src=x onerror=alert(1)/>"  -> ""
 */
export function stripHtmlTags(value: string): string {
  if (!value) return "";
  return value
    .replace(/\0/g, "")           // Remove null bytes
    .replace(/<[^>]*>/g, "")      // Remove all HTML tags
    .replace(/\s{2,}/g, " ")      // Collapse leftover whitespace
    .trim();
}

/**
 * Keys to skip when sanitizing — these are IDs, tokens, emails, enums,
 * or regex-constrained fields that are already safe and must not be altered.
 */
const DEFAULT_SKIP_KEYS = new Set([
  // Auth / security tokens
  "password",
  "token",
  "sessionToken",
  "otp",
  "razorpay_order_id",
  "razorpay_payment_id",
  "razorpay_signature",
  // IDs
  "id",
  "orderId",
  "userId",
  "order_id",
  "user_id",
  "product_id",
  // Validated-format fields
  "email",
  "guest_email",
  "guest_phone",
  "phone",
  "pincode",
  "sku",
  "hsn",
  "ip",
  "cidrRange",
  // Enum / constrained fields
  "vendorName",
  "blockType",
  "action",
  "category",
  "fieldName",
  "status",
  "riskLevel",
  "remediationStatus",
  "dpbBreachType",
  "currency",
  "country",
  // External reference IDs
  "vendorReferenceId",
  // Date strings (ISO format, never contain HTML)
  "breachOccurredAt",
  "weNotifiedDpbAt",
  "usersNotifiedAt",
  "dpbNotifiedAt",
]);

/**
 * Recursively sanitize all string values in an object by stripping HTML tags.
 * Handles nested objects, arrays of strings, and arrays of objects.
 * Skips keys in the provided set (or DEFAULT_SKIP_KEYS) — these are fields
 * that are already constrained by Zod enums, regex, or format validators.
 *
 * Non-string values (numbers, booleans, null) pass through unchanged.
 */
export function sanitizeObject<T>(
  obj: T,
  skipKeys?: Set<string>
): T {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }

  const skip = skipKeys ?? DEFAULT_SKIP_KEYS;

  if (Array.isArray(obj)) {
    return obj.map((item) => {
      if (typeof item === "string") return stripHtmlTags(item);
      if (typeof item === "object" && item !== null) return sanitizeObject(item, skip);
      return item;
    }) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === "string") {
      result[key] = skip.has(key) ? value : stripHtmlTags(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === "string") return skip.has(key) ? item : stripHtmlTags(item);
        if (typeof item === "object" && item !== null) return sanitizeObject(item, skip);
        return item;
      });
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeObject(value, skip);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}
