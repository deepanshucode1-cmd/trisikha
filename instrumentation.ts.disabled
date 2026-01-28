/**
 * Next.js Instrumentation
 * This file is executed during the server startup
 */

export async function register() {
  // Skip validation in test environment or if explicitly disabled
  if (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST ||
    process.env.SKIP_ENV_VALIDATION === "true"
  ) {
    return;
  }

  // Only run on Node.js runtime (server-side)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnvironment } = await import("@/lib/env-validation");
    assertEnvironment();
  }
}
