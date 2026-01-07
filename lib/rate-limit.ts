import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Check if Upstash Redis credentials are available
const hasRedisCredentials = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

// In-memory fallback for development (warning: does not work across serverless function instances)
class InMemoryRateLimiter {
  private store: Map<string, { count: number; resetAt: number }> = new Map();

  async limit(identifier: string, maxRequests: number, windowMs: number) {
    const now = Date.now();
    const key = identifier;
    const existing = this.store.get(key);

    if (existing && existing.resetAt > now) {
      if (existing.count >= maxRequests) {
        return {
          success: false,
          limit: maxRequests,
          remaining: 0,
          reset: existing.resetAt,
        };
      }
      existing.count++;
      return {
        success: true,
        limit: maxRequests,
        remaining: maxRequests - existing.count,
        reset: existing.resetAt,
      };
    }

    // Create new or reset window
    const resetAt = now + windowMs;
    this.store.set(key, { count: 1, resetAt });

    // Cleanup old entries
    for (const [k, v] of this.store.entries()) {
      if (v.resetAt <= now) {
        this.store.delete(k);
      }
    }

    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - 1,
      reset: resetAt,
    };
  }
}

const inMemoryLimiter = new InMemoryRateLimiter();

// IP-based rate limiting for OTP requests (3 requests per 10 minutes)
export const otpRateLimit = hasRedisCredentials
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(3, "10 m"),
      prefix: "ratelimit:otp",
    })
  : {
      limit: async (identifier: string) =>
        inMemoryLimiter.limit(identifier, 3, 10 * 60 * 1000),
    };

// Rate limiting for checkout (10 requests per hour)
export const checkoutRateLimit = hasRedisCredentials
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "ratelimit:checkout",
    })
  : {
      limit: async (identifier: string) =>
        inMemoryLimiter.limit(identifier, 10, 60 * 60 * 1000),
    };

// Rate limiting for payment verification (30 requests per hour)
export const paymentRateLimit = hasRedisCredentials
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(30, "1 h"),
      prefix: "ratelimit:payment",
    })
  : {
      limit: async (identifier: string) =>
        inMemoryLimiter.limit(identifier, 30, 60 * 60 * 1000),
    };

// Rate limiting for order cancellation (5 requests per hour)
export const cancelOrderRateLimit = hasRedisCredentials
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      prefix: "ratelimit:cancel",
    })
  : {
      limit: async (identifier: string) =>
        inMemoryLimiter.limit(identifier, 5, 60 * 60 * 1000),
    };

// General API rate limiting (60 requests per minute)
export const apiRateLimit = hasRedisCredentials
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "ratelimit:api",
    })
  : {
      limit: async (identifier: string) =>
        inMemoryLimiter.limit(identifier, 60, 60 * 1000),
    };

// Helper function to get client IP from request
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
