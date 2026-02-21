import { describe, it, expect, vi, afterEach } from "vitest";
import {
  escapeHtml,
  sanitizeUrl,
  stripHtmlTags,
  sanitizeObject,
} from "@/lib/xss";

// ─── escapeHtml ───────────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("escapes <script> tags", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("escapes <img onerror> payloads", () => {
    const result = escapeHtml('<img src=x onerror=alert(1)>');
    expect(result).toContain("&lt;img");
    expect(result).not.toContain("<img");
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#039;s");
  });

  it("returns empty string for null", () => {
    expect(escapeHtml(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(escapeHtml(undefined)).toBe("");
  });
});

// ─── sanitizeUrl ──────────────────────────────────────────────────────────────

const ALLOWED_DOMAINS = "*.shiprocket.in,trisikha.com,localhost";

describe("sanitizeUrl — protocol injection", () => {
  beforeEach(() => {
    vi.stubEnv("ALLOWED_URL_DOMAINS", ALLOWED_DOMAINS);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects javascript: protocol", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
  });

  it("rejects data: protocol", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
  });

  it("rejects vbscript: protocol", () => {
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBe("");
  });

  it("returns empty string for empty string input", () => {
    expect(sanitizeUrl("")).toBe("");
  });

  it("returns empty string for null", () => {
    expect(sanitizeUrl(null)).toBe("");
  });
});

describe("sanitizeUrl — domain allowlist", () => {
  beforeEach(() => {
    vi.stubEnv("ALLOWED_URL_DOMAINS", ALLOWED_DOMAINS);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows subdomain matching *.shiprocket.in wildcard", () => {
    const url = "https://app.shiprocket.in/label/123";
    expect(sanitizeUrl(url)).toBe(url);
  });

  it("allows exact domain trisikha.com", () => {
    const url = "https://trisikha.com/my-data";
    expect(sanitizeUrl(url)).toBe(url);
  });

  it("allows localhost (dev domain)", () => {
    const url = "http://localhost:3000/cancel";
    expect(sanitizeUrl(url)).toBe(url);
  });

  it("rejects a domain not in the allowlist", () => {
    expect(sanitizeUrl("http://evil-phishing.com")).toBe("");
  });

  it("rejects a domain that looks like a subdomain of an allowed domain but isn't", () => {
    // notshiprocket.in is not shiprocket.in, so *.shiprocket.in should NOT match
    expect(sanitizeUrl("https://notshiprocket.in/fake")).toBe("");
  });

  it("rejects a domain that has the allowed domain as a substring (not at boundary)", () => {
    // evil-trisikha.com is not trisikha.com
    expect(sanitizeUrl("https://evil-trisikha.com")).toBe("");
  });
});

describe("sanitizeUrl — fails closed when ALLOWED_URL_DOMAINS is unset", () => {
  beforeEach(() => {
    vi.stubEnv("ALLOWED_URL_DOMAINS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns empty string even for a normally-valid https URL", () => {
    expect(sanitizeUrl("https://trisikha.com")).toBe("");
  });
});

// ─── stripHtmlTags ────────────────────────────────────────────────────────────

describe("stripHtmlTags", () => {
  it("strips <b> tags and preserves text", () => {
    expect(stripHtmlTags("<b>John</b>")).toBe("John");
  });

  it("strips <script> tags, preserving inner text", () => {
    expect(stripHtmlTags("<script>alert(1)</script>")).toBe("alert(1)");
  });

  it("strips <img onerror> leaving no attribute content", () => {
    const result = stripHtmlTags('<img src=x onerror=alert(1)/>');
    // Tag is gone; no HTML
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    // The src/onerror attribute values are not retained as text
    expect(result.trim()).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(stripHtmlTags("")).toBe("");
  });
});

// ─── sanitizeObject ───────────────────────────────────────────────────────────

describe("sanitizeObject", () => {
  it("strips HTML tags from top-level string values", () => {
    const input = { name: "<b>John</b>", city: "Mumbai" };
    const result = sanitizeObject(input);
    expect(result.name).toBe("John");
    expect(result.city).toBe("Mumbai");
  });

  it("strips HTML from nested object values", () => {
    const input = { address: { line1: "<script>evil</script> Street" } };
    const result = sanitizeObject(input);
    expect((result.address as { line1: string }).line1).toBe("evil Street");
  });

  it("strips HTML from items in string arrays", () => {
    const input = { tags: ["<b>organic</b>", "fresh"] };
    const result = sanitizeObject(input);
    expect((result.tags as string[])[0]).toBe("organic");
    expect((result.tags as string[])[1]).toBe("fresh");
  });

  it("preserves keys in the DEFAULT_SKIP_KEYS set (e.g. email)", () => {
    const input = { email: "user@example.com<script>" };
    const result = sanitizeObject(input);
    // email is in DEFAULT_SKIP_KEYS, so it should NOT be stripped
    expect(result.email).toBe("user@example.com<script>");
  });

  it("passes non-string primitives through unchanged", () => {
    const input = { qty: 3, active: true, nothing: null };
    const result = sanitizeObject(input);
    expect(result.qty).toBe(3);
    expect(result.active).toBe(true);
    expect(result.nothing).toBeNull();
  });
});
