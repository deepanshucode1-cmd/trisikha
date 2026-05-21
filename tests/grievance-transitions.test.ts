import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

interface QueuedResponse {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
  payload?: Record<string, unknown>;
}

function createScriptedSupabase() {
  const queues: Record<string, QueuedResponse[]> = {};
  const calls: RecordedCall[] = [];

  function consumeNext(table: string): QueuedResponse {
    const queue = queues[table];
    if (!queue || queue.length === 0) return { data: null, error: null };
    return queue.shift()!;
  }

  function buildChain(table: string) {
    const record = (method: string, args: unknown[]) => {
      const entry: RecordedCall = { table, method, args };
      if (method === "insert" || method === "update") {
        entry.payload = args[0] as Record<string, unknown>;
      }
      calls.push(entry);
    };

    const chain: Record<string, unknown> = {};

    chain.select = vi.fn((...args: unknown[]) => {
      record("select", args);
      return chain;
    });
    chain.insert = vi.fn((...args: unknown[]) => {
      record("insert", args);
      return chain;
    });
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      record("update", [payload]);
      return chain;
    });
    chain.eq = vi.fn((col: string, val: unknown) => {
      record("eq", [col, val]);
      return chain;
    });
    chain.single = vi.fn(() => Promise.resolve(consumeNext(table)));
    chain.then = (
      resolve: (v: QueuedResponse) => unknown,
      reject?: (e: unknown) => unknown
    ) => Promise.resolve(consumeNext(table)).then(resolve, reject);

    return chain;
  }

  return {
    supabase: { from: vi.fn((table: string) => buildChain(table)) },
    queues,
    calls,
    setResponses(table: string, responses: QueuedResponse[]) {
      queues[table] = [...responses];
    },
  };
}

let scripted = createScriptedSupabase();

vi.mock("@/utils/supabase/service", () => ({
  createServiceClient: () => scripted.supabase,
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

import {
  postAdminMessage,
  postUserDispute,
  acceptResolution,
  forceClose,
} from "@/lib/grievance";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findInsert(table: string) {
  return scripted.calls.find(
    (c) => c.table === table && c.method === "insert"
  );
}

function findUpdate(
  table: string,
  predicate: (payload: Record<string, unknown>) => boolean
) {
  return scripted.calls.find(
    (c) =>
      c.table === table && c.method === "update" && predicate(c.payload || {})
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Grievance state transitions", () => {
  beforeEach(() => {
    scripted = createScriptedSupabase();
    vi.clearAllMocks();
  });

  // ─── postAdminMessage ────────────────────────────────────────────────────

  describe("postAdminMessage", () => {
    it("T2: open + non-proposal → in_progress (message inserted)", async () => {
      scripted.setResponses("grievances", [
        { data: { id: "g-1", email: "a@t.com", status: "open" }, error: null },
      ]);

      const result = await postAdminMessage({
        grievanceId: "g-1",
        adminId: "admin-1",
        body: "Looking into this.",
        proposesClose: false,
      });

      expect(result.success).toBe(true);

      const messageInsert = findInsert("grievance_messages");
      expect(messageInsert?.payload).toMatchObject({
        author_role: "admin",
        author_id: "admin-1",
        proposes_close: false,
      });

      const update = findUpdate(
        "grievances",
        (p) => p.status === "in_progress"
      );
      expect(update).toBeDefined();
    });

    it("T4b: open + proposesClose → awaiting_user_response (skip-step)", async () => {
      scripted.setResponses("grievances", [
        { data: { id: "g-1", email: "a@t.com", status: "open" }, error: null },
      ]);

      const result = await postAdminMessage({
        grievanceId: "g-1",
        adminId: "admin-1",
        body: "Refund processed. Closing.",
        proposesClose: true,
      });

      expect(result.success).toBe(true);
      const update = findUpdate(
        "grievances",
        (p) => p.status === "awaiting_user_response"
      );
      expect(update).toBeDefined();
      expect(update?.payload).toMatchObject({
        awaiting_since: expect.any(String),
        silence_reminder_sent_at: null,
      });
    });

    it("T4a: in_progress + proposesClose → awaiting_user_response", async () => {
      scripted.setResponses("grievances", [
        {
          data: { id: "g-1", email: "a@t.com", status: "in_progress" },
          error: null,
        },
      ]);

      await postAdminMessage({
        grievanceId: "g-1",
        adminId: "admin-1",
        body: "Here is the resolution.",
        proposesClose: true,
      });

      const update = findUpdate(
        "grievances",
        (p) => p.status === "awaiting_user_response"
      );
      expect(update).toBeDefined();
    });

    it("T9: awaiting + clarification resets silence clock", async () => {
      scripted.setResponses("grievances", [
        {
          data: {
            id: "g-1",
            email: "a@t.com",
            status: "awaiting_user_response",
          },
          error: null,
        },
      ]);

      await postAdminMessage({
        grievanceId: "g-1",
        adminId: "admin-1",
        body: "Quick clarification.",
        proposesClose: false,
      });

      // Status unchanged, silence-clock fields reset.
      const update = findUpdate(
        "grievances",
        (p) =>
          p.awaiting_since !== undefined && p.silence_reminder_sent_at === null
      );
      expect(update).toBeDefined();
      expect(update?.payload).not.toHaveProperty("status");
    });

    it("T3: in_progress + non-proposal is a state no-op", async () => {
      scripted.setResponses("grievances", [
        {
          data: { id: "g-1", email: "a@t.com", status: "in_progress" },
          error: null,
        },
      ]);

      await postAdminMessage({
        grievanceId: "g-1",
        adminId: "admin-1",
        body: "Following up internally.",
        proposesClose: false,
      });

      const updates = scripted.calls.filter(
        (c) => c.table === "grievances" && c.method === "update"
      );
      // Status not touched; only updated_at goes in.
      expect(updates[0]?.payload).not.toHaveProperty("status");
      expect(updates[0]?.payload).not.toHaveProperty("awaiting_since");
    });

    it("rejects when grievance is already closed", async () => {
      scripted.setResponses("grievances", [
        {
          data: { id: "g-1", email: "a@t.com", status: "closed" },
          error: null,
        },
      ]);

      const result = await postAdminMessage({
        grievanceId: "g-1",
        adminId: "admin-1",
        body: "Stale reply.",
        proposesClose: false,
      });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/cannot post/i);
      // No message INSERT, no status UPDATE.
      expect(findInsert("grievance_messages")).toBeUndefined();
    });

    it("returns failure if grievance not found", async () => {
      scripted.setResponses("grievances", [{ data: null, error: null }]);

      const result = await postAdminMessage({
        grievanceId: "missing",
        adminId: "admin-1",
        body: "hi",
        proposesClose: false,
      });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not found/i);
    });
  });

  // ─── postUserDispute ─────────────────────────────────────────────────────

  describe("postUserDispute", () => {
    it("T6: awaiting → in_progress with awaiting_since cleared", async () => {
      scripted.setResponses("grievances", [
        {
          data: {
            id: "g-1",
            email: "a@t.com",
            status: "awaiting_user_response",
          },
          error: null,
        },
      ]);

      const result = await postUserDispute({
        grievanceId: "g-1",
        body: "This is still broken for me.",
      });

      expect(result.success).toBe(true);

      const messageInsert = findInsert("grievance_messages");
      expect(messageInsert?.payload).toMatchObject({
        author_role: "user",
        author_id: null,
        proposes_close: false,
      });

      const update = findUpdate(
        "grievances",
        (p) => p.status === "in_progress"
      );
      expect(update?.payload).toMatchObject({
        awaiting_since: null,
        silence_reminder_sent_at: null,
      });
    });

    it("rejects when status is not awaiting_user_response", async () => {
      scripted.setResponses("grievances", [
        { data: { id: "g-1", email: "a@t.com", status: "in_progress" }, error: null },
      ]);

      const result = await postUserDispute({
        grievanceId: "g-1",
        body: "anything",
      });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/when admin has replied/i);
      expect(findInsert("grievance_messages")).toBeUndefined();
    });
  });

  // ─── acceptResolution ────────────────────────────────────────────────────

  describe("acceptResolution", () => {
    it("T5: awaiting → closed with closed_by_role='user' (silent)", async () => {
      scripted.setResponses("grievances", [
        {
          data: {
            id: "g-1",
            email: "a@t.com",
            status: "awaiting_user_response",
          },
          error: null,
        },
      ]);

      const result = await acceptResolution({ grievanceId: "g-1" });

      expect(result.success).toBe(true);

      // NO message inserted — silent acceptance.
      expect(findInsert("grievance_messages")).toBeUndefined();

      const update = findUpdate("grievances", (p) => p.status === "closed");
      expect(update?.payload).toMatchObject({
        status: "closed",
        closed_by_role: "user",
        closed_at: expect.any(String),
      });
    });

    it("rejects when status is not awaiting_user_response", async () => {
      scripted.setResponses("grievances", [
        { data: { id: "g-1", email: "a@t.com", status: "open" }, error: null },
      ]);

      const result = await acceptResolution({ grievanceId: "g-1" });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/no closure proposal/i);
    });
  });

  // ─── forceClose ──────────────────────────────────────────────────────────

  describe("forceClose", () => {
    it("T8: closes with closed_by_role='admin' and force_close_reason", async () => {
      scripted.setResponses("grievances", [
        { data: { id: "g-1", email: "a@t.com", status: "in_progress" }, error: null },
      ]);

      const result = await forceClose({
        grievanceId: "g-1",
        adminId: "admin-1",
        reason: "Submitter became unresponsive and abusive across channels.",
      });

      expect(result.success).toBe(true);
      const update = findUpdate("grievances", (p) => p.status === "closed");
      expect(update?.payload).toMatchObject({
        status: "closed",
        closed_by_role: "admin",
        force_close_reason: expect.stringContaining("unresponsive"),
      });
    });

    it("rejects reason shorter than 20 characters", async () => {
      const result = await forceClose({
        grievanceId: "g-1",
        adminId: "admin-1",
        reason: "too short",
      });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/20 characters/i);
      // No DB call should have been made.
      expect(scripted.calls.length).toBe(0);
    });

    it("rejects when grievance is already closed", async () => {
      scripted.setResponses("grievances", [
        { data: { id: "g-1", email: "a@t.com", status: "closed" }, error: null },
      ]);

      const result = await forceClose({
        grievanceId: "g-1",
        adminId: "admin-1",
        reason: "Trying to close an already-closed grievance for some reason.",
      });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/already closed/i);
    });
  });
});
