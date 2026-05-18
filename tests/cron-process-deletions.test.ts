import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Bypass QStash signature verification by running the route in "development"
// mode — the route's `verifyQStashSignature` short-circuits to `true` when
// NODE_ENV is development and QSTASH_CURRENT_SIGNING_KEY is unset.
vi.stubEnv("NODE_ENV", "development");
vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "");

// Stub deletion-request service: cron only calls these two functions.
const mockAutoExec = vi.fn();
const mockGetRequestsNeedingReminders = vi.fn();
const mockMarkReminderSent = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/deletion-request", () => ({
  autoExecutePendingDeletions: (...args: unknown[]) => mockAutoExec(...args),
  getRequestsNeedingReminders: (...args: unknown[]) => mockGetRequestsNeedingReminders(...args),
  markReminderSent: (...args: unknown[]) => mockMarkReminderSent(...args),
  getDaysRemaining: vi.fn(() => 7),
}));

// Stub auto-cleanup: each function returns a deterministic counter shape.
const mockSendAbandonedCartRecovery = vi.fn();
const mockNotifyAbandonedCheckouts = vi.fn();
const mockDeleteAbandonedCheckouts = vi.fn();
const mockNotifyDeferredExpiry = vi.fn();
const mockExecuteDeferredDeletions = vi.fn();
const mockPurgeExpiredGuestSessions = vi.fn();
const mockPurgeStaleReviewTokens = vi.fn();
const mockAnonymiseStaleCorrectionRequests = vi.fn();
const mockAnonymiseStaleGrievances = vi.fn();

vi.mock("@/lib/auto-cleanup", () => ({
  sendAbandonedCartRecovery: (...args: unknown[]) => mockSendAbandonedCartRecovery(...args),
  notifyAbandonedCheckouts: (...args: unknown[]) => mockNotifyAbandonedCheckouts(...args),
  deleteAbandonedCheckouts: (...args: unknown[]) => mockDeleteAbandonedCheckouts(...args),
  notifyDeferredExpiry: (...args: unknown[]) => mockNotifyDeferredExpiry(...args),
  executeDeferredDeletions: (...args: unknown[]) => mockExecuteDeferredDeletions(...args),
  purgeExpiredGuestSessions: (...args: unknown[]) => mockPurgeExpiredGuestSessions(...args),
  purgeStaleReviewTokens: (...args: unknown[]) => mockPurgeStaleReviewTokens(...args),
  anonymiseStaleCorrectionRequests: (...args: unknown[]) => mockAnonymiseStaleCorrectionRequests(...args),
  anonymiseStaleGrievances: (...args: unknown[]) => mockAnonymiseStaleGrievances(...args),
}));

vi.mock("@/lib/nominee", () => ({
  getExpiredClaimDocuments: vi.fn().mockResolvedValue([]),
  markDocumentDeleted: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/nominee-storage", () => ({
  deleteClaimDocument: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/email", () => ({
  sendDeletionReminder: vi.fn().mockResolvedValue(true),
}));

const mockLogError = vi.fn();
const mockLogSecurityEvent = vi.fn();

vi.mock("@/lib/logger", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...args),
}));

// Import AFTER mocks
import { POST } from "@/app/api/cron/process-deletions/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cronRequest(): Request {
  return new Request("http://localhost/api/cron/process-deletions", {
    method: "POST",
  });
}

function zeroAutoExecResult() {
  return {
    attempted: 0,
    completed: 0,
    deferred: 0,
    retryable: 0,
    errors: 0,
    completionEmailsSent: 0,
    completionEmailsFailed: 0,
    deferredEmailsSent: 0,
    deferredEmailsFailed: 0,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/cron/process-deletions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: every step returns a clean zero result.
    mockAutoExec.mockResolvedValue(zeroAutoExecResult());
    mockGetRequestsNeedingReminders.mockResolvedValue({ day1: [], day7: [], day13: [] });
    mockSendAbandonedCartRecovery.mockResolvedValue({ notified: 0, errors: 0 });
    mockNotifyAbandonedCheckouts.mockResolvedValue({ notified: 0, errors: 0 });
    mockDeleteAbandonedCheckouts.mockResolvedValue({ deleted: 0, errors: 0 });
    mockNotifyDeferredExpiry.mockResolvedValue({ notified: 0, errors: 0 });
    mockExecuteDeferredDeletions.mockResolvedValue({ deleted: 0, errors: 0 });
    mockPurgeExpiredGuestSessions.mockResolvedValue({ deleted: 0, errors: 0 });
    mockPurgeStaleReviewTokens.mockResolvedValue({ deleted: 0, errors: 0 });
    mockAnonymiseStaleCorrectionRequests.mockResolvedValue({ notified: 0, errors: 0 });
    mockAnonymiseStaleGrievances.mockResolvedValue({ notified: 0, errors: 0 });
  });

  it("surfaces all PII-cleanup counters in the JSON response", async () => {
    mockPurgeExpiredGuestSessions.mockResolvedValueOnce({ deleted: 3, errors: 0 });
    mockPurgeStaleReviewTokens.mockResolvedValueOnce({ deleted: 5, errors: 0 });
    mockAnonymiseStaleCorrectionRequests.mockResolvedValueOnce({ notified: 2, errors: 0 });
    mockAnonymiseStaleGrievances.mockResolvedValueOnce({ notified: 1, errors: 0 });

    const res = await POST(cronRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.results).toMatchObject({
      guestSessionsPurged: 3,
      reviewTokensPurged: 5,
      correctionRequestsAnonymised: 2,
      grievancesAnonymised: 1,
      piiCleanupErrors: 0,
    });
  });

  it("calls every PII-cleanup step exactly once", async () => {
    await POST(cronRequest());

    expect(mockPurgeExpiredGuestSessions).toHaveBeenCalledTimes(1);
    expect(mockPurgeStaleReviewTokens).toHaveBeenCalledTimes(1);
    expect(mockAnonymiseStaleCorrectionRequests).toHaveBeenCalledTimes(1);
    expect(mockAnonymiseStaleGrievances).toHaveBeenCalledTimes(1);
  });

  it("accumulates errors across PII-cleanup steps without aborting", async () => {
    mockPurgeExpiredGuestSessions.mockResolvedValueOnce({ deleted: 0, errors: 1 });
    mockPurgeStaleReviewTokens.mockResolvedValueOnce({ deleted: 0, errors: 2 });
    mockAnonymiseStaleCorrectionRequests.mockResolvedValueOnce({ notified: 0, errors: 1 });

    const res = await POST(cronRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.results.piiCleanupErrors).toBe(4);
    // All four steps still ran despite earlier errors
    expect(mockAnonymiseStaleGrievances).toHaveBeenCalledTimes(1);
  });

  it("treats a thrown step as one error and continues", async () => {
    mockPurgeExpiredGuestSessions.mockRejectedValueOnce(new Error("boom"));

    const res = await POST(cronRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.results.piiCleanupErrors).toBeGreaterThanOrEqual(1);
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: "cron_purge_guest_sessions" })
    );
    // Subsequent steps still invoked
    expect(mockPurgeStaleReviewTokens).toHaveBeenCalled();
    expect(mockAnonymiseStaleCorrectionRequests).toHaveBeenCalled();
    expect(mockAnonymiseStaleGrievances).toHaveBeenCalled();
  });

  it("logs the security event with PII-cleanup counters included", async () => {
    mockPurgeStaleReviewTokens.mockResolvedValueOnce({ deleted: 7, errors: 0 });

    await POST(cronRequest());

    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "cron_process_deletions_completed",
      expect.objectContaining({
        reviewTokensPurged: 7,
        guestSessionsPurged: 0,
        correctionRequestsAnonymised: 0,
        grievancesAnonymised: 0,
      })
    );
  });
});
