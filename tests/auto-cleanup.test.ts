import { describe, it, expect, vi, beforeEach } from "vitest";
import { subDays, subHours } from "date-fns";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Build a chainable Supabase mock where the terminal call resolves to configurable data
function createChainableMock(resolvedValue: Record<string, unknown> = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = () => chain;

  chain.select = vi.fn().mockReturnValue(self());
  chain.insert = vi.fn().mockReturnValue(self());
  chain.update = vi.fn().mockReturnValue(self());
  chain.delete = vi.fn().mockReturnValue(self());
  chain.eq = vi.fn().mockReturnValue(self());
  chain.neq = vi.fn().mockReturnValue(self());
  chain.lt = vi.fn().mockReturnValue(self());
  chain.lte = vi.fn().mockReturnValue(self());
  chain.in = vi.fn().mockReturnValue(self());

  // Terminal calls that actually resolve
  chain.then = vi.fn((resolve) => resolve(resolvedValue));

  // Make the chain thenable so `await` works
  Object.defineProperty(chain, "then", {
    value: (resolve: (v: unknown) => void) => Promise.resolve(resolvedValue).then(resolve),
    writable: true,
    configurable: true,
  });

  return chain;
}

// Track calls to `from()` and return different chains per table
let fromCalls: { table: string; chain: ReturnType<typeof createChainableMock> }[] = [];
let fromHandlers: Record<string, ReturnType<typeof createChainableMock>> = {};

const mockSupabase = {
  from: vi.fn((table: string) => {
    const chain = fromHandlers[table] || createChainableMock();
    fromCalls.push({ table, chain });
    return chain;
  }),
};

vi.mock("@/utils/supabase/service", () => ({
  createServiceClient: vi.fn(() => mockSupabase),
}));

const mockSendPreErasureNotification = vi.fn().mockResolvedValue(true);
const mockSendDeletionCompleted = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/email", () => ({
  sendPreErasureNotification: (...args: unknown[]) => mockSendPreErasureNotification(...args),
  sendDeletionCompleted: (...args: unknown[]) => mockSendDeletionCompleted(...args),
}));

const mockLogError = vi.fn();
const mockLogSecurityEvent = vi.fn();

vi.mock("@/lib/logger", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...args),
}));

const mockLogDataAccess = vi.fn().mockResolvedValue("audit-id");

vi.mock("@/lib/audit", () => ({
  logDataAccess: (...args: unknown[]) => mockLogDataAccess(...args),
}));

// Import AFTER mocks are set up
import {
  notifyAbandonedCheckouts,
  deleteAbandonedCheckouts,
  notifyDeferredExpiry,
  executeDeferredDeletions,
} from "@/lib/auto-cleanup";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupFromHandler(table: string, resolvedValue: Record<string, unknown>) {
  fromHandlers[table] = createChainableMock(resolvedValue);
  return fromHandlers[table];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Auto-Cleanup Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCalls = [];
    fromHandlers = {};
  });

  // ─── notifyAbandonedCheckouts ─────────────────────────────────────────────

  describe("notifyAbandonedCheckouts", () => {
    it("should return { notified: 0, errors: 0 } when no abandoned orders found", async () => {
      setupFromHandler("orders", { data: [], error: null });

      const result = await notifyAbandonedCheckouts();

      expect(result).toEqual({ notified: 0, errors: 0 });
      expect(mockSendPreErasureNotification).not.toHaveBeenCalled();
    });

    it("should return { notified: 0, errors: 0 } when data is null", async () => {
      setupFromHandler("orders", { data: null, error: null });

      const result = await notifyAbandonedCheckouts();

      expect(result).toEqual({ notified: 0, errors: 0 });
    });

    it("should return errors when query fails", async () => {
      setupFromHandler("orders", {
        data: null,
        error: { message: "DB error", code: "500" },
      });

      const result = await notifyAbandonedCheckouts();

      expect(result).toEqual({ notified: 0, errors: 1 });
      expect(mockLogError).toHaveBeenCalledTimes(1);
    });

    it("should send one email per customer and mark orders as notified", async () => {
      const oldDate = subDays(new Date(), 6).toISOString();
      const orders = [
        { id: "order-1", guest_email: "alice@test.com", created_at: oldDate },
        { id: "order-2", guest_email: "alice@test.com", created_at: oldDate },
        { id: "order-3", guest_email: "bob@test.com", created_at: oldDate },
      ];

      setupFromHandler("orders", { data: orders, error: null });

      const result = await notifyAbandonedCheckouts();

      // 2 emails sent: one for alice (2 orders), one for bob (1 order)
      expect(mockSendPreErasureNotification).toHaveBeenCalledTimes(2);

      // Check alice's email
      expect(mockSendPreErasureNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "alice@test.com",
          reason: "abandoned_checkout",
          orderCount: 2,
        })
      );

      // Check bob's email
      expect(mockSendPreErasureNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "bob@test.com",
          reason: "abandoned_checkout",
          orderCount: 1,
        })
      );

      // All 3 orders notified
      expect(result.notified).toBe(3);
      expect(result.errors).toBe(0);

      // Audit logged for each customer
      expect(mockLogDataAccess).toHaveBeenCalledTimes(2);
    });

    it("should count errors when email sending fails for a customer", async () => {
      const oldDate = subDays(new Date(), 6).toISOString();
      const orders = [
        { id: "order-1", guest_email: "fail@test.com", created_at: oldDate },
      ];

      setupFromHandler("orders", { data: orders, error: null });
      mockSendPreErasureNotification.mockRejectedValueOnce(new Error("SMTP error"));

      const result = await notifyAbandonedCheckouts();

      expect(result.errors).toBe(1);
      expect(result.notified).toBe(0);
      expect(mockLogError).toHaveBeenCalledTimes(1);
    });

    it("should not mark orders when email returns false", async () => {
      const oldDate = subDays(new Date(), 6).toISOString();
      const orders = [
        { id: "order-1", guest_email: "nomail@test.com", created_at: oldDate },
      ];

      setupFromHandler("orders", { data: orders, error: null });
      mockSendPreErasureNotification.mockResolvedValueOnce(false);

      const result = await notifyAbandonedCheckouts();

      expect(result.notified).toBe(0);
      expect(mockLogDataAccess).not.toHaveBeenCalled();
    });
  });

  // ─── deleteAbandonedCheckouts ─────────────────────────────────────────────

  describe("deleteAbandonedCheckouts", () => {
    it("should return { deleted: 0, errors: 0 } when no eligible orders found", async () => {
      setupFromHandler("orders", { data: [], error: null });

      const result = await deleteAbandonedCheckouts();

      expect(result).toEqual({ deleted: 0, errors: 0 });
    });

    it("should return errors when query fails", async () => {
      setupFromHandler("orders", {
        data: null,
        error: { message: "DB error", code: "500" },
      });

      const result = await deleteAbandonedCheckouts();

      expect(result).toEqual({ deleted: 0, errors: 1 });
      expect(mockLogError).toHaveBeenCalledTimes(1);
    });

    it("should delete eligible orders and log audit events", async () => {
      const orders = [
        { id: "order-1", guest_email: "alice@test.com" },
        { id: "order-2", guest_email: "alice@test.com" },
        { id: "order-3", guest_email: "bob@test.com" },
      ];

      setupFromHandler("orders", { data: orders, error: null });

      const result = await deleteAbandonedCheckouts();

      expect(result.deleted).toBe(3);
      expect(result.errors).toBe(0);

      // Audit log: one per unique email
      expect(mockLogDataAccess).toHaveBeenCalledTimes(2);
      expect(mockLogDataAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "orders",
          operation: "DELETE",
          queryType: "bulk",
          rowCount: 2,
        })
      );

      // Security event logged
      expect(mockLogSecurityEvent).toHaveBeenCalledWith("auto_cleanup_abandoned", {
        deletedCount: 3,
        emailsAffected: 2,
      });
    });
  });

  // ─── notifyDeferredExpiry ─────────────────────────────────────────────────

  describe("notifyDeferredExpiry", () => {
    it("should return { notified: 0, errors: 0 } when no deferred requests found", async () => {
      setupFromHandler("deletion_requests", { data: [], error: null });

      const result = await notifyDeferredExpiry();

      expect(result).toEqual({ notified: 0, errors: 0 });
      expect(mockSendPreErasureNotification).not.toHaveBeenCalled();
    });

    it("should return errors when query fails", async () => {
      setupFromHandler("deletion_requests", {
        data: null,
        error: { message: "DB error", code: "500" },
      });

      const result = await notifyDeferredExpiry();

      expect(result).toEqual({ notified: 0, errors: 1 });
    });

    it("should send pre-erasure notification for expiring requests", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const requests = [
        {
          id: "req-1",
          guest_email: "alice@test.com",
          retention_end_date: tomorrow.toISOString().split("T")[0],
        },
      ];

      // First call is deletion_requests query, subsequent calls are orders count
      setupFromHandler("deletion_requests", { data: requests, error: null });
      setupFromHandler("orders", { count: 3, data: null, error: null });

      const result = await notifyDeferredExpiry();

      expect(mockSendPreErasureNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "alice@test.com",
          reason: "retention_expired",
          orderCount: 3,
        })
      );

      expect(result.notified).toBe(1);
      expect(result.errors).toBe(0);
      expect(mockLogDataAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "deletion_requests",
          operation: "UPDATE",
        })
      );
    });

    it("should count errors when email fails for a request", async () => {
      const requests = [
        {
          id: "req-1",
          guest_email: "fail@test.com",
          retention_end_date: "2026-02-10",
        },
      ];

      setupFromHandler("deletion_requests", { data: requests, error: null });
      setupFromHandler("orders", { count: 1, data: null, error: null });
      mockSendPreErasureNotification.mockRejectedValueOnce(new Error("SMTP fail"));

      const result = await notifyDeferredExpiry();

      expect(result.errors).toBe(1);
      expect(result.notified).toBe(0);
    });
  });

  // ─── executeDeferredDeletions ─────────────────────────────────────────────

  describe("executeDeferredDeletions", () => {
    it("should return { deleted: 0, errors: 0 } when no requests eligible", async () => {
      setupFromHandler("deletion_requests", { data: [], error: null });

      const result = await executeDeferredDeletions();

      expect(result).toEqual({ deleted: 0, errors: 0 });
    });

    it("should return errors when query fails", async () => {
      setupFromHandler("deletion_requests", {
        data: null,
        error: { message: "DB error", code: "500" },
      });

      const result = await executeDeferredDeletions();

      expect(result).toEqual({ deleted: 0, errors: 1 });
    });

    it("should delete orders, mark request completed, and send completion email", async () => {
      const notifiedAt = subHours(new Date(), 50).toISOString();
      const requests = [
        {
          id: "req-1",
          guest_email: "alice@test.com",
          retention_end_date: "2026-02-01",
        },
      ];

      setupFromHandler("deletion_requests", { data: requests, error: null });
      setupFromHandler("orders", {
        data: [{ id: "o-1" }, { id: "o-2" }],
        error: null,
      });

      const result = await executeDeferredDeletions();

      expect(result.deleted).toBe(1);
      expect(result.errors).toBe(0);

      // Completion email sent
      expect(mockSendDeletionCompleted).toHaveBeenCalledWith({
        email: "alice@test.com",
        ordersAnonymized: 2,
      });

      // Audit log
      expect(mockLogDataAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "orders",
          operation: "DELETE",
          rowCount: 2,
        })
      );

      // Security event
      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        "auto_cleanup_deferred_expiry",
        expect.objectContaining({
          requestId: "req-1",
          email: "alice@test.com",
          ordersDeleted: 2,
        })
      );
    });

    it("should continue processing other requests when one fails to delete", async () => {
      const requests = [
        { id: "req-1", guest_email: "fail@test.com", retention_end_date: "2026-01-01" },
        { id: "req-2", guest_email: "ok@test.com", retention_end_date: "2026-01-01" },
      ];

      // First call: deletion_requests query returns both
      // Since both use the same "orders" handler, we need to handle the sequence.
      // The mock will return error for all orders calls — this tests the error path
      setupFromHandler("deletion_requests", { data: requests, error: null });
      setupFromHandler("orders", {
        data: null,
        error: { message: "FK violation", code: "23503" },
      });

      const result = await executeDeferredDeletions();

      // Both fail because the orders delete fails
      expect(result.errors).toBe(2);
      expect(result.deleted).toBe(0);
      expect(mockLogError).toHaveBeenCalledTimes(2);
    });

    it("should not fail if completion email throws", async () => {
      const requests = [
        { id: "req-1", guest_email: "alice@test.com", retention_end_date: "2026-02-01" },
      ];

      setupFromHandler("deletion_requests", { data: requests, error: null });
      setupFromHandler("orders", { data: [{ id: "o-1" }], error: null });
      mockSendDeletionCompleted.mockRejectedValueOnce(new Error("SMTP error"));

      const result = await executeDeferredDeletions();

      // Deletion still succeeds despite email failure
      expect(result.deleted).toBe(1);
      expect(result.errors).toBe(0);
    });
  });
});
