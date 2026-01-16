/**
 * Environment variable validation for production readiness
 * This module validates required environment variables at startup
 */

interface EnvVar {
  name: string;
  required: boolean;
  secret?: boolean; // If true, won't log the value
}

// Check if running on Vercel (serverless)
const isVercel = !!process.env.VERCEL;
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

export function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const isProduction = process.env.NODE_ENV === "production";

  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar.name];
    const isRequired = typeof envVar.required === "boolean" ? envVar.required : true;

    if (isRequired && !value) {
      errors.push(`Missing required environment variable: ${envVar.name}`);
    }

    // Additional production checks
    if (isProduction && value) {
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
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Run validation and optionally throw on errors
 */
export function assertEnvironment(): void {
  const { valid, errors } = validateEnvironment();

  if (!valid) {
    const errorMessage = `Environment validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;

    if (process.env.NODE_ENV === "production") {
      throw new Error(errorMessage);
    } else {
      console.warn(`[ENV WARNING] ${errorMessage}`);
    }
  }
}
