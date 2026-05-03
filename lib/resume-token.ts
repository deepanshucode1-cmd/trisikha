import crypto from "crypto";
import { addDays } from "date-fns";

const RESUME_TOKEN_TTL_DAYS = 7;

export function generateResumeToken(): {
  rawToken: string;
  hash: string;
  expiresAt: Date;
} {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  return {
    rawToken,
    hash: hashResumeToken(rawToken),
    expiresAt: addDays(new Date(), RESUME_TOKEN_TTL_DAYS),
  };
}

export function hashResumeToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function buildResumeUrl(rawToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://trisikhaorganics.com";
  return `${baseUrl}/resume/${rawToken}`;
}
