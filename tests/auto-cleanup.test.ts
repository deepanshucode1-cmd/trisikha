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
  chain.is = vi.fn().mockReturnValue(self());
  chain.or = vi.fn().mockReturnValue(self());
  chain.not = vi.fn().mockReturnValue(self());

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

// Build a chainable mock that consumes a queue of responses on each await.
// Use when a function makes multiple sequential awaits against the same table.
function createChainableQueueMock(responses: Array<Record<string, unknown>>) {
  const queue = [...responses];
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
  chain.is = vi.fn().mockReturnValue(self());
  chain.or = vi.fn().mockReturnValue(self());
  chain.not = vi.fn().mockReturnValue(self());

  Object.defineProperty(chain, "then", {
    value: (resolve: (v: unknown) => void) => {
      const next = queue.shift() || { data: null, error: null };
      return Promise.resolve(next).then(resolve);
    },
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
const mockSendCartRecoveryEmail = vi.fn().mockResolvedValue(true);
const mockSendGrievanceSilenceReminder = vi.fn().mockResolvedValue(true);
const mockSendGrievanceAutoClosed = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/email", () => ({
  sendPreErasureNotification: (...args: unknown[]) => mockSendPreErasureNotification(...args),
  sendDeletionCompleted: (...args: unknown[]) => mockSendDeletionCompleted(...args),
  sendCartRecoveryEmail: (...args: unknown[]) => mockSendCartRecoveryEmail(...args),
  sendGrievanceSilenceReminder: (...args: unknown[]) => mockSendGrievanceSilenceReminder(...args),
  sendGrievanceAutoClosed: (...args: unknown[]) => mockSendGrievanceAutoClosed(...args),
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
  purgeExpiredGuestSessions,
  purgeStaleReviewTokens,
  anonymiseStaleCorrectionRequests,
  anonymiseStaleGrievances,
  remindGrievanceSilence,
  autoCloseSilentGrievances,
} from "@/lib/auto-cleanup";
import { scrubRazorpayNotes } from "@/lib/razorpay-server";

const mockedScrub = vi.mocked(scrubRazorpayNotes);

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

    it("scrubs Razorpay notes before hard-delete (2.A.5)", async () => {
      const requests = [
        { id: "req-1", guest_email: "alice@test.com", retention_end_date: "2026-02-01" },
      ];

      setupFromHandler("deletion_requests", { data: requests, error: null });
      // Queue: first await on orders fetches razorpay_order_ids,
      // second await is the DELETE+RETURNING.
      fromHandlers["orders"] = createChainableQueueMock([
        {
          data: [
            { razorpay_order_id: "rzp_a" },
            { razorpay_order_id: null }, // should be filtered
            { razorpay_order_id: "rzp_b" },
          ],
          error: null,
        },
        { data: [{ id: "o-1" }, { id: "o-2" }, { id: "o-3" }], error: null },
      ]);

      const result = await executeDeferredDeletions();

      expect(result.deleted).toBe(1);
      expect(mockedScrub).toHaveBeenCalledWith("rzp_a");
      expect(mockedScrub).toHaveBeenCalledWith("rzp_b");
      expect(mockedScrub).toHaveBeenCalledTimes(2);
      expect(mockedScrub).not.toHaveBeenCalledWith(null);
    });
  });

  // ─── purgeExpiredGuestSessions ────────────────────────────────────────────

  describe("purgeExpiredGuestSessions", () => {
    it("returns { deleted: 0, errors: 0 } when no eligible rows", async () => {
      setupFromHandler("guest_data_sessions", { data: [], error: null });

      const result = await purgeExpiredGuestSessions();

      expect(result).toEqual({ deleted: 0, errors: 0 });
      expect(mockLogDataAccess).not.toHaveBeenCalled();
      expect(mockLogSecurityEvent).not.toHaveBeenCalled();
    });

    it("deletes and counts rows when expired sessions exist", async () => {
      const purged = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];
      setupFromHandler("guest_data_sessions", { data: purged, error: null });

      const result = await purgeExpiredGuestSessions();

      expect(result).toEqual({ deleted: 3, errors: 0 });
      expect(mockLogDataAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "guest_data_sessions",
          operation: "DELETE",
          rowCount: 3,
        })
      );
      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        "auto_cleanup_guest_sessions",
        expect.objectContaining({ deletedCount: 3 })
      );
    });

    it("applies all three OR predicates (otp / session / lockout)", async () => {
      const chain = setupFromHandler("guest_data_sessions", { data: [], error: null });

      await purgeExpiredGuestSessions();

      // Three .or() invocations correspond to the three time windows.
      expect(chain.or).toHaveBeenCalledTimes(3);
      const calls = (chain.or as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
      expect(calls.some((q: string) => q.includes("otp_expires_at"))).toBe(true);
      expect(calls.some((q: string) => q.includes("session_expires_at"))).toBe(true);
      expect(calls.some((q: string) => q.includes("otp_locked_until"))).toBe(true);
    });

    it("returns errors=1 and skips audit on query failure", async () => {
      setupFromHandler("guest_data_sessions", {
        data: null,
        error: { message: "boom" },
      });

      const result = await purgeExpiredGuestSessions();

      expect(result).toEqual({ deleted: 0, errors: 1 });
      expect(mockLogError).toHaveBeenCalledTimes(1);
      expect(mockLogDataAccess).not.toHaveBeenCalled();
    });
  });

  // ─── purgeStaleReviewTokens ───────────────────────────────────────────────

  describe("purgeStaleReviewTokens", () => {
    it("returns zero when nothing stuck and nothing stale", async () => {
      // 3 awaits in order: reviews(SELECT), review_tokens(DELETE recovery
      // — skipped because no stuckIds), review_tokens(DELETE stale).
      // With no stuckIds the recovery DELETE is short-circuited, so the
      // queue is: reviews → review_tokens(stale).
      fromHandlers["reviews"] = createChainableQueueMock([
        { data: [], error: null },
      ]);
      fromHandlers["review_tokens"] = createChainableQueueMock([
        { data: [], error: null },
      ]);

      const result = await purgeStaleReviewTokens();

      expect(result).toEqual({ deleted: 0, errors: 0 });
      expect(mockLogDataAccess).not.toHaveBeenCalled();
    });

    it("recovers consumed-but-stuck tokens AND purges stale unused", async () => {
      // Stuck refs from reviews → 2 token ids. Recovery delete returns 2.
      // Then stale delete returns 3 more rows.
      fromHandlers["reviews"] = createChainableQueueMock([
        {
          data: [
            { review_token_id: "tok-1" },
            { review_token_id: "tok-2" },
          ],
          error: null,
        },
      ]);
      fromHandlers["review_tokens"] = createChainableQueueMock([
        { data: [{ id: "tok-1" }, { id: "tok-2" }], error: null }, // recovery
        { data: [{ id: "t3" }, { id: "t4" }, { id: "t5" }], error: null }, // stale
      ]);

      const result = await purgeStaleReviewTokens();

      expect(result.deleted).toBe(5);
      expect(result.errors).toBe(0);
      expect(mockLogDataAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "review_tokens",
          rowCount: 5,
        })
      );
    });

    it("continues to stale step when recovery query fails", async () => {
      fromHandlers["reviews"] = createChainableQueueMock([
        { data: null, error: { message: "fail" } },
      ]);
      fromHandlers["review_tokens"] = createChainableQueueMock([
        { data: [{ id: "stale-1" }], error: null },
      ]);

      const result = await purgeStaleReviewTokens();

      // Recovery step contributed 0 + 1 error, stale step contributed 1.
      expect(result.deleted).toBe(1);
      expect(result.errors).toBe(1);
    });

    it("records error from stale delete but preserves recovery count", async () => {
      fromHandlers["reviews"] = createChainableQueueMock([
        { data: [{ review_token_id: "tok-1" }], error: null },
      ]);
      fromHandlers["review_tokens"] = createChainableQueueMock([
        { data: [{ id: "tok-1" }], error: null }, // recovery success
        { data: null, error: { message: "stale fail" } }, // stale fails
      ]);

      const result = await purgeStaleReviewTokens();

      expect(result.deleted).toBe(1);
      expect(result.errors).toBe(1);
    });
  });

  // ─── anonymiseStaleCorrectionRequests ─────────────────────────────────────

  describe("anonymiseStaleCorrectionRequests", () => {
    it("returns zero when no terminal-state rows past cutoff", async () => {
      setupFromHandler("correction_requests", { data: [], error: null });

      const result = await anonymiseStaleCorrectionRequests();

      expect(result).toEqual({ notified: 0, errors: 0 });
      expect(mockLogDataAccess).not.toHaveBeenCalled();
    });

    it("nulls all PII columns and stamps anonymised_at", async () => {
      const chain = setupFromHandler("correction_requests", {
        data: [{ id: "cr-1" }, { id: "cr-2" }],
        error: null,
      });

      const result = await anonymiseStaleCorrectionRequests();

      expect(result.notified).toBe(2);

      // The UPDATE call payload should null every PII column and set anonymised_at.
      const updateCall = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.email).toBeNull();
      expect(updateCall.current_value).toBeNull();
      expect(updateCall.requested_value).toBeNull();
      expect(updateCall.ip_address).toBeNull();
      expect(updateCall.user_agent).toBeNull();
      expect(updateCall.anonymised_at).toEqual(expect.any(String));
    });

    it("filters to approved/rejected with anonymised_at IS NULL", async () => {
      const chain = setupFromHandler("correction_requests", {
        data: [],
        error: null,
      });

      await anonymiseStaleCorrectionRequests();

      // status IN (approved, rejected)
      expect(chain.in).toHaveBeenCalledWith("status", ["approved", "rejected"]);
      // anonymised_at IS NULL (idempotency guard)
      expect(chain.is).toHaveBeenCalledWith("anonymised_at", null);
      // processed_at < cutoff
      expect(chain.lt).toHaveBeenCalledWith(
        "processed_at",
        expect.any(String)
      );
    });

    it("returns errors=1 on DB failure", async () => {
      setupFromHandler("correction_requests", {
        data: null,
        error: { message: "db down" },
      });

      const result = await anonymiseStaleCorrectionRequests();

      expect(result).toEqual({ notified: 0, errors: 1 });
      expect(mockLogError).toHaveBeenCalledTimes(1);
    });
  });

  // ─── anonymiseStaleGrievances ─────────────────────────────────────────────

  describe("anonymiseStaleGrievances", () => {
    it("returns zero when no terminal-state rows past cutoff", async () => {
      setupFromHandler("grievances", { data: [], error: null });

      const result = await anonymiseStaleGrievances();

      expect(result).toEqual({ notified: 0, errors: 0 });
      expect(mockLogDataAccess).not.toHaveBeenCalled();
    });

    it("nulls subject/description/email and stamps anonymised_at", async () => {
      const chain = setupFromHandler("grievances", {
        data: [{ id: "g-1" }],
        error: null,
      });

      const result = await anonymiseStaleGrievances();

      expect(result.notified).toBe(1);
      const updateCall = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.email).toBeNull();
      expect(updateCall.subject).toBeNull();
      expect(updateCall.description).toBeNull();
      expect(updateCall.ip_address).toBeNull();
      expect(updateCall.user_agent).toBeNull();
      expect(updateCall.anonymised_at).toEqual(expect.any(String));
    });

    it("filters to closed with closed_at < cutoff AND anonymised_at IS NULL", async () => {
      const chain = setupFromHandler("grievances", { data: [], error: null });

      await anonymiseStaleGrievances();

      // After 20260517150000, the new state machine has only 'closed' as a
      // terminal state and uses closed_at as the cutoff anchor.
      expect(chain.eq).toHaveBeenCalledWith("status", "closed");
      expect(chain.is).toHaveBeenCalledWith("anonymised_at", null);
      expect(chain.lt).toHaveBeenCalledWith("closed_at", expect.any(String));
    });

    it("scrubs user-authored messages on the anonymised grievances", async () => {
      // Two grievances qualify for parent-row anonymisation; the function
      // should then issue a second UPDATE against grievance_messages
      // filtered by author_role='user'.
      const parentIds = [{ id: "g-1" }, { id: "g-2" }];
      fromHandlers["grievances"] = createChainableQueueMock([
        { data: parentIds, error: null }, // parent UPDATE returns ids
      ]);
      const messagesChain = setupFromHandler("grievance_messages", {
        data: [{ id: "m-1" }],
        error: null,
      });

      const result = await anonymiseStaleGrievances();

      expect(result.notified).toBe(2);
      expect(messagesChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ body: null, anonymised_at: expect.any(String) })
      );
      expect(messagesChain.in).toHaveBeenCalledWith("grievance_id", ["g-1", "g-2"]);
      expect(messagesChain.eq).toHaveBeenCalledWith("author_role", "user");
      expect(messagesChain.is).toHaveBeenCalledWith("anonymised_at", null);
    });

    it("returns errors=1 on DB failure", async () => {
      setupFromHandler("grievances", {
        data: null,
        error: { message: "db down" },
      });

      const result = await anonymiseStaleGrievances();

      expect(result).toEqual({ notified: 0, errors: 1 });
      expect(mockLogError).toHaveBeenCalledTimes(1);
    });
  });

  // ─── remindGrievanceSilence (day-14) ─────────────────────────────────────

  describe("remindGrievanceSilence", () => {
    it("returns zero when no awaiting_user_response grievances qualify", async () => {
      setupFromHandler("grievances", { data: [], error: null });

      const result = await remindGrievanceSilence();

      expect(result).toEqual({ notified: 0, errors: 0 });
      expect(mockSendGrievanceSilenceReminder).not.toHaveBeenCalled();
    });

    it("filters to awaiting_user_response + silence_reminder_sent_at IS NULL + awaiting_since < cutoff", async () => {
      const chain = setupFromHandler("grievances", { data: [], error: null });

      await remindGrievanceSilence();

      expect(chain.eq).toHaveBeenCalledWith(
        "status",
        "awaiting_user_response"
      );
      expect(chain.is).toHaveBeenCalledWith("silence_reminder_sent_at", null);
      expect(chain.lt).toHaveBeenCalledWith(
        "awaiting_since",
        expect.any(String)
      );
    });

    it("sends reminder email and stamps silence_reminder_sent_at per row", async () => {
      // First await on grievances = SELECT (returns 1 candidate).
      // Second await on grievances = UPDATE silence_reminder_sent_at.
      fromHandlers["grievances"] = createChainableQueueMock([
        {
          data: [
            {
              id: "g-1",
              email: "alice@test.com",
              subject: "Refund issue",
              awaiting_since: new Date(
                Date.now() - 15 * 24 * 60 * 60 * 1000
              ).toISOString(),
            },
          ],
          error: null,
        },
        { data: null, error: null }, // mark-sent UPDATE
      ]);

      const result = await remindGrievanceSilence();

      expect(result.notified).toBe(1);
      expect(mockSendGrievanceSilenceReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "alice@test.com",
          grievanceId: "g-1",
          subject: "Refund issue",
        })
      );
    });

    it("returns errors=1 on SELECT failure", async () => {
      setupFromHandler("grievances", {
        data: null,
        error: { message: "db down" },
      });

      const result = await remindGrievanceSilence();

      expect(result).toEqual({ notified: 0, errors: 1 });
      expect(mockLogError).toHaveBeenCalled();
    });
  });

  // ─── autoCloseSilentGrievances (day-30) ──────────────────────────────────

  describe("autoCloseSilentGrievances", () => {
    it("returns zero when no awaiting grievances are 30+ days silent", async () => {
      setupFromHandler("grievances", { data: [], error: null });

      const result = await autoCloseSilentGrievances();

      expect(result).toEqual({ deleted: 0, errors: 0 });
      expect(mockSendGrievanceAutoClosed).not.toHaveBeenCalled();
    });

    it("transitions to closed with closed_by_role='auto_silence'", async () => {
      // SELECT → returns 1 candidate. UPDATE (atomic with race-guard
      // WHERE clause) → success.
      fromHandlers["grievances"] = createChainableQueueMock([
        {
          data: [
            { id: "g-30", email: "bob@test.com", subject: "Late delivery" },
          ],
          error: null,
        },
        { data: null, error: null }, // UPDATE
      ]);

      const result = await autoCloseSilentGrievances();

      expect(result.deleted).toBe(1);
      // Two emails per row: one to user, one to officer.
      expect(mockSendGrievanceAutoClosed).toHaveBeenCalledTimes(2);
      expect(mockSendGrievanceAutoClosed).toHaveBeenCalledWith(
        expect.objectContaining({ audience: "user", grievanceId: "g-30" })
      );
      expect(mockSendGrievanceAutoClosed).toHaveBeenCalledWith(
        expect.objectContaining({ audience: "officer", grievanceId: "g-30" })
      );
    });

    it("UPDATE WHERE clause re-asserts the precondition (race guard)", async () => {
      // Inspect the chain methods to confirm the race-guard predicate is
      // present on the UPDATE step.
      const chain = setupFromHandler("grievances", {
        data: [{ id: "g-1", email: "x@test.com", subject: "X" }],
        error: null,
      });

      await autoCloseSilentGrievances();

      // The UPDATE chain includes both an eq(status, awaiting_user_response)
      // and an lt(awaiting_since, ...) to guard against admin replies
      // sneaking in between SELECT and UPDATE.
      const eqCalls = (chain.eq as ReturnType<typeof vi.fn>).mock.calls;
      const ltCalls = (chain.lt as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        eqCalls.some(
          (c) => c[0] === "status" && c[1] === "awaiting_user_response"
        )
      ).toBe(true);
      expect(ltCalls.some((c) => c[0] === "awaiting_since")).toBe(true);
    });

    it("returns errors=1 on SELECT failure", async () => {
      setupFromHandler("grievances", {
        data: null,
        error: { message: "db down" },
      });

      const result = await autoCloseSilentGrievances();

      expect(result).toEqual({ deleted: 0, errors: 1 });
    });
  });
});
