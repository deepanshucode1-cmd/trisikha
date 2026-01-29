import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { logError } from "@/lib/logger";

// Simple in-memory cache to prevent database hammering
// Note: On serverless, this resets on cold start
let lastCheck: {
  result: HealthResponse;
  timestamp: number;
} | null = null;

// Counter for periodic logging (only log every Nth check to reduce latency)
let checkCounter = 0;

const CACHE_TTL_MS = 5000; // 5 seconds
const LOG_EVERY_N_CHECKS = 6; // Log every 6th check (~30 min with 5-min interval)

// Serverless-aware thresholds
// Cold starts on Vercel can add 500ms-2s, plus Supabase connection time
const DEGRADED_THRESHOLD_MS = 8000; // 8 seconds (accounts for cold start)
const UNHEALTHY_THRESHOLD_MS = 25000; // 25 seconds (near UptimeRobot's 30s timeout)

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  db: "ok" | "error";
  timestamp: string;
  latency_ms: number;
  cold_start?: boolean;
  details?: {
    products_count?: number;
    orders_count?: number;
  };
}

/**
 * Health check endpoint for uptime monitoring
 *
 * GET /api/health
 * GET /api/health?mode=lite  (faster, skips detailed check)
 * GET /api/health?mode=full  (includes table counts)
 *
 * Returns:
 * - 200 OK: Service is healthy
 * - 503 Service Unavailable: Service is unhealthy (database down)
 *
 * Optimized for serverless (Vercel):
 * - Uses simple SELECT 1 ping by default (fast)
 * - Async logging (doesn't block response)
 * - Higher thresholds to account for cold starts
 * - Logs only every Nth check to reduce writes
 */
export async function GET(request: Request) {

  const startTime = Date.now();
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "lite";

  // Detect potential cold start (no cache = likely cold start)
  const isColdStart = lastCheck === null;

  // Check cache first (won't help on cold start, but prevents hammering)
  if (lastCheck && Date.now() - lastCheck.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(lastCheck.result, {
      status: lastCheck.result.status === "unhealthy" ? 503 : 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Cache": "HIT",
      },
    });
  }

  try {
    const supabase = createServiceClient();

    let healthData: Record<string, number> | null = null;
    let dbError: Error | null = null;

    if (mode === "full") {
      // Full mode: Call get_database_health() for detailed stats
      const { data, error } = await supabase.rpc("get_database_health");
      if (error) {
        dbError = new Error(error.message);
      } else {
        healthData = data;
      }
    } else {
      // Lite mode (default): Simple ping - much faster
      const { error } = await supabase.from("products").select("id").limit(1);
      if (error) {
        dbError = new Error(error.message);
      }
    }

    const latencyMs = Date.now() - startTime;

    if (dbError) {
      // Database is not responding
      const response: HealthResponse = {
        status: "unhealthy",
        db: "error",
        timestamp: new Date().toISOString(),
        latency_ms: latencyMs,
        cold_start: isColdStart,
      };

      // Log unhealthy status immediately (async, don't await)
      logHealthCheckAsync(supabase, "unhealthy", latencyMs, dbError.message);

      // Update cache
      lastCheck = { result: response, timestamp: Date.now() };

      return NextResponse.json(response, {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Cache": "MISS",
        },
      });
    }

    // Determine health status based on response time
    // Use higher thresholds to account for serverless cold starts
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (latencyMs > UNHEALTHY_THRESHOLD_MS) {
      status = "unhealthy"; // Way too slow, likely a problem
    } else if (latencyMs > DEGRADED_THRESHOLD_MS) {
      status = "degraded"; // Slow but responding (could be cold start)
    }

    const response: HealthResponse = {
      status,
      db: "ok",
      timestamp: new Date().toISOString(),
      latency_ms: latencyMs,
      cold_start: isColdStart,
      ...(healthData && {
        details: {
          products_count: healthData.products_count,
          orders_count: healthData.orders_count,
        },
      }),
    };

    // Periodic logging to reduce database writes
    // Always log unhealthy/degraded, but only log healthy every Nth check
    checkCounter++;
    if (status !== "healthy" || checkCounter >= LOG_EVERY_N_CHECKS) {
      logHealthCheckAsync(supabase, status, latencyMs);
      checkCounter = 0;
    }

    // Update cache
    lastCheck = { result: response, timestamp: Date.now() };

    return NextResponse.json(response, {
      status: status === "unhealthy" ? 503 : 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logError(error as Error, { endpoint: "/api/health" });

    const response: HealthResponse = {
      status: "unhealthy",
      db: "error",
      timestamp: new Date().toISOString(),
      latency_ms: latencyMs,
      cold_start: isColdStart,
    };

    // Update cache even for errors
    lastCheck = { result: response, timestamp: Date.now() };

    return NextResponse.json(response, {
      status: 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Cache": "MISS",
      },
    });
  }
}

/**
 * Log health check result to uptime_log table (async, fire-and-forget)
 * This doesn't block the health check response
 */
function logHealthCheckAsync(
  supabase: ReturnType<typeof createServiceClient>,
  status: "healthy" | "degraded" | "unhealthy",
  responseTimeMs: number,
  errorMessage?: string
) {
  // Fire and forget - don't await
  supabase
    .from("uptime_log")
    .insert({
      status,
      response_time_ms: responseTimeMs,
      source: "internal",
      error_message: errorMessage,
    })
    .then(
      () => {
        // Success - no action needed
      },
      (err: any) => {
        // Don't fail the health check if logging fails
        logError(err as Error, { context: "uptime_log_insert" });
      }
    );
}
