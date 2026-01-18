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
 * Sanitize URL to prevent javascript: and other dangerous protocols
 * Only allows http and https URLs
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return url;
  } catch {
    // If URL parsing fails, it's not a valid URL
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
