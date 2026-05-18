import { vi } from "vitest";

// Mock environment variables for testing
vi.stubEnv("NODE_ENV", "test");

// Mock Supabase service client
vi.mock("@/utils/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      rpc: vi.fn(),
    })),
    rpc: vi.fn(),
  })),
}));

// Mock Redis
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: vi.fn(() => ({
      get: vi.fn(),
      set: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      pexpire: vi.fn(),
    })),
  },
}));

// Mock the razorpay-server module so importing it doesn't construct a real
// Razorpay client (which requires RAZORPAY_KEY_ID at module-load time).
// Tests that need to assert scrub calls can override with vi.mocked(...).
vi.mock("@/lib/razorpay-server", () => ({
  scrubRazorpayNotes: vi.fn(async () => undefined),
}));
