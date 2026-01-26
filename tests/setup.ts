import { vi } from "vitest";

// Mock environment variables for testing
process.env.NODE_ENV = "test";

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
