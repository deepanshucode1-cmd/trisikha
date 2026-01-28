/**
 * Environment variable validation for production readiness
 * This module validates required environment variables at startup
 */

interface EnvVar {
  name: string;
  required: boolean;
  secret?: boolean; // If true, won't log the value
}

// Check if running on Vercel (serverless) - indicates actual production deployment
const isVercel = !!process.env.VERCEL;
// NODE_ENV is "production" during `next build` even locally, so we need to distinguish
// actual production deployment from local production builds
const isProductionDeployment = isVercel || !!process.env.CI;
const isProduction = process.env.NODE_ENV === "production";

const REQUIRED_ENV_VARS: EnvVar[] = [
  // Supabase
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: true },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, secret: true },
  { name: "SUPABASE_SERVICE_ROLE_KEY", required: true, secret: true },

  // Razorpay
  { name: "RAZORPAY_KEY_ID", required: true },
  { name: "RAZORPAY_KEY_SECRET", required: true, secret: true },
  { name: "RAZORPAY_WEBHOOK_SECRET", required: true, secret: true },

  // Shiprocket
  { name: "SHIPROCKET_EMAIL", required: true },
  { name: "SHIPROCKET_PASSWORD", required: true, secret: true },
  { name: "STORE_PINCODE", required: true },

  // Email
  { name: "EMAIL_USER", required: true },
  { name: "EMAIL_PASS", required: true, secret: true },

  // Application
  { name: "NEXT_PUBLIC_APP_URL", required: true },

  // Security
  { name: "CSRF_SECRET", required: isProduction, secret: true },

  // Rate Limiting - REQUIRED on Vercel (in-memory doesn't work on serverless)
  { name: "UPSTASH_REDIS_REST_URL", required: isVercel || isProduction },
  { name: "UPSTASH_REDIS_REST_TOKEN", required: isVercel || isProduction, secret: true },
];

export function validateEnvironment(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar.name];
    const isRequired = typeof envVar.required === "boolean" ? envVar.required : true;

    if (isRequired && !value) {
      errors.push(`Missing required environment variable: ${envVar.name}`);
    }

    // Additional production deployment checks (only on Vercel/CI, not local builds)
    if (isProductionDeployment && value) {
      // Check for test/demo values in production
      if (
        envVar.name === "RAZORPAY_KEY_ID" &&
        value.startsWith("rzp_test_")
      ) {
        errors.push(
          `RAZORPAY_KEY_ID appears to be a test key in production environment`
        );
      }

      // Check for weak secrets
      if (envVar.secret && value.length < 16) {
        errors.push(
          `${envVar.name} appears to be too short for a secure secret`
        );
      }
    }

    // Warn about test keys during local production builds (not an error)
    if (isProduction && !isProductionDeployment && value) {
      if (
        envVar.name === "RAZORPAY_KEY_ID" &&
        value.startsWith("rzp_test_")
      ) {
        warnings.push(
          `RAZORPAY_KEY_ID is a test key - use live keys for actual production deployment`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Run validation and optionally throw on errors
 */
export function assertEnvironment(): void {
  // Skip validation if explicitly disabled (for staging environments with test keys)
  if (process.env.SKIP_ENV_VALIDATION === "true") {
    console.warn("[ENV] Skipping environment validation (SKIP_ENV_VALIDATION=true)");
    return;
  }

  const { valid, errors, warnings } = validateEnvironment();

  // Show warnings (non-fatal)
  if (warnings.length > 0) {
    console.warn(`[ENV WARNING]\n${warnings.map((w) => `  - ${w}`).join("\n")}`);
  }

  if (!valid) {
    const errorMessage = `Environment validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;

    // Only throw on actual production deployments (Vercel/CI)
    if (isProductionDeployment) {
      throw new Error(errorMessage);
    } else {
      console.warn(`[ENV WARNING] ${errorMessage}`);
    }
  }
}
