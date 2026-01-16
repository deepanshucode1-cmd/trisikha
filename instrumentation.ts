/**
 * Next.js Instrumentation
 * This file is executed during the server startup
 */

export async function register() {
  // Only run on Node.js runtime (server-side)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnvironment } = await import("@/lib/env-validation");
    assertEnvironment();
  }
}
