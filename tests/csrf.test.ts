import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock next/headers before any import that uses it (vi.mock is hoisted)
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";
import {
  generateCsrfToken,
  verifyCsrfToken,
  requireCsrf,
  validateCsrfRequest,
} from "@/lib/csrf";

// ─── generateCsrfToken ────────────────────────────────────────────────────────

describe("generateCsrfToken", () => {
  it("returns a 3-part colon-joined string", () => {
    const token = generateCsrfToken();
    const parts = token.split(":");
    expect(parts).toHaveLength(3);
  });

  it("all three parts are non-empty", () => {
    const token = generateCsrfToken();
    const parts = token.split(":");
    expect(parts[0].length).toBeGreaterThan(0); // timestamp
    expect(parts[1].length).toBeGreaterThan(0); // randomPart (32 hex chars)
    expect(parts[2].length).toBeGreaterThan(0); // signature (64 hex chars)
  });

  it("generates unique tokens on each call", () => {
    const t1 = generateCsrfToken();
    const t2 = generateCsrfToken();
    expect(t1).not.toBe(t2);
  });
});

// ─── verifyCsrfToken ──────────────────────────────────────────────────────────

describe("verifyCsrfToken", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for a freshly generated token", () => {
    const token = generateCsrfToken();
    expect(verifyCsrfToken(token)).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(verifyCsrfToken("")).toBe(false);
  });

  it("returns false when token has fewer than 3 parts", () => {
    expect(verifyCsrfToken("only:twoparts")).toBe(false);
  });

  it("returns false when token has more than 3 parts", () => {
    // Extra colon means 4 parts
    const token = generateCsrfToken() + ":extra";
    expect(verifyCsrfToken(token)).toBe(false);
  });

  it("returns false when signature is tampered", () => {
    const token = generateCsrfToken();
    const parts = token.split(":");
    // Flip one char in the signature
    const bad = parts[2][0] === "a" ? "b" : "a";
    const tampered = `${parts[0]}:${parts[1]}:${bad}${parts[2].slice(1)}`;
    expect(verifyCsrfToken(tampered)).toBe(false);
  });

  it("returns false for a token older than 24 hours (expired)", () => {
    // Travel back 25 hours so the generated token looks 25 hours old
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() - 25 * 60 * 60 * 1000);
    const oldToken = generateCsrfToken();
    vi.useRealTimers(); // restore before verifying
    expect(verifyCsrfToken(oldToken)).toBe(false);
  });

  it("returns false for a token with a future timestamp (tokenAge < 0)", () => {
    // Travel forward 1 hour so the token appears to be from the future
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    const futureToken = generateCsrfToken();
    vi.useRealTimers();
    expect(verifyCsrfToken(futureToken)).toBe(false);
  });
});

// ─── requireCsrf — exempt paths ───────────────────────────────────────────────

describe("requireCsrf — exempt paths", () => {
  it("GET requests are exempt → {valid: true}", async () => {
    const req = new Request("http://localhost:3000/api/seller/products", {
      method: "GET",
    });
    const result = await requireCsrf(req);
    expect(result).toEqual({ valid: true });
  });

  it("OPTIONS requests are exempt → {valid: true}", async () => {
    const req = new Request("http://localhost:3000/api/seller/products", {
      method: "OPTIONS",
    });
    const result = await requireCsrf(req);
    expect(result).toEqual({ valid: true });
  });

  it("HEAD requests are exempt → {valid: true}", async () => {
    const req = new Request("http://localhost:3000/api/seller/products", {
      method: "HEAD",
    });
    const result = await requireCsrf(req);
    expect(result).toEqual({ valid: true });
  });

  it("POST to webhook path is exempt → {valid: true}", async () => {
    const req = new Request(
      "http://localhost:3000/api/webhooks/razorpay/verify",
      { method: "POST" }
    );
    const result = await requireCsrf(req);
    expect(result).toEqual({ valid: true });
  });

  it("POST to non-exempt path without token → {valid: false}", async () => {
    // No cookies mock needed — validateCsrfRequest will return false with no tokens
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    });

    const req = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
    });
    const result = await requireCsrf(req);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ─── validateCsrfRequest ──────────────────────────────────────────────────────

describe("validateCsrfRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valid header + matching cookie → true", async () => {
    const token = generateCsrfToken();

    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: vi.fn().mockImplementation((name: string) =>
        name === "csrf_token" ? { value: token } : undefined
      ),
    });

    const req = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "x-csrf-token": token },
    });

    expect(await validateCsrfRequest(req)).toBe(true);
  });

  it("header token only, no cookie → false", async () => {
    const token = generateCsrfToken();

    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined), // no cookie
    });

    const req = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "x-csrf-token": token },
    });

    expect(await validateCsrfRequest(req)).toBe(false);
  });

  it("cookie only, no header → false", async () => {
    const token = generateCsrfToken();

    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: vi.fn().mockImplementation((name: string) =>
        name === "csrf_token" ? { value: token } : undefined
      ),
    });

    // No x-csrf-token header
    const req = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
    });

    expect(await validateCsrfRequest(req)).toBe(false);
  });

  it("header and cookie present but different tokens → false", async () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();

    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: vi.fn().mockImplementation((name: string) =>
        name === "csrf_token" ? { value: token2 } : undefined
      ),
    });

    const req = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "x-csrf-token": token1 },
    });

    expect(await validateCsrfRequest(req)).toBe(false);
  });
});
