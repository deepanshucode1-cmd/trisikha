"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useCsrf } from "@/hooks/useCsrf";

// Types — mirror lib/grievance.ts after the acceptance-workflow migration.
type GrievanceStatus =
  | "open"
  | "in_progress"
  | "awaiting_user_response"
  | "closed";
type GrievanceCategory =
  | "data_processing"
  | "correction"
  | "deletion"
  | "consent"
  | "breach"
  | "other";
type GrievancePriority = "low" | "medium" | "high";
type ClosedByRole = "user" | "admin" | "auto_silence";

type GrievanceMessage = {
  id: string;
  author_role: "user" | "admin";
  body: string | null;
  proposes_close: boolean;
  anonymised_at: string | null;
  created_at: string;
};

type Grievance = {
  id: string;
  email: string;
  subject: string;
  description: string;
  category: GrievanceCategory;
  status: GrievanceStatus;
  priority: GrievancePriority;
  sla_deadline: string;
  ip_address: string | null;
  closed_at: string | null;
  closed_by_role: ClosedByRole | null;
  awaiting_since: string | null;
  force_close_reason: string | null;
  created_at: string;
  updated_at: string;
  messages?: GrievanceMessage[];
};

type GrievanceStats = {
  open: number;
  inProgress: number;
  awaitingUser: number;
  closed: number;
  overdue: number;
};

const STATUS_CONFIG: Record<
  GrievanceStatus,
  { label: string; color: string; bgColor: string }
> = {
  open: { label: "Open", color: "text-yellow-700", bgColor: "bg-yellow-100" },
  in_progress: {
    label: "In Progress",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
  },
  awaiting_user_response: {
    label: "Awaiting User",
    color: "text-purple-700",
    bgColor: "bg-purple-100",
  },
  closed: { label: "Closed", color: "text-gray-700", bgColor: "bg-gray-100" },
};

const CATEGORY_LABELS: Record<GrievanceCategory, string> = {
  data_processing: "Data Processing",
  correction: "Correction",
  deletion: "Deletion",
  consent: "Consent",
  breach: "Data Breach",
  other: "Other",
};

const CLOSED_BY_LABELS: Record<ClosedByRole, string> = {
  user: "Customer accepted",
  admin: "Admin force-closed",
  auto_silence: "Auto-closed (no response)",
};

const PRIORITY_CONFIG: Record<
  GrievancePriority,
  { label: string; color: string; bgColor: string }
> = {
  low: { label: "Low", color: "text-gray-700", bgColor: "bg-gray-100" },
  medium: {
    label: "Medium",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
  },
  high: { label: "High", color: "text-red-700", bgColor: "bg-red-100" },
};

export default function GrievancesTab() {
  const { token: csrfToken } = useCsrf();

  // State
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [stats, setStats] = useState<GrievanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<GrievanceStatus | "all">(
    "all"
  );
  const [categoryFilter, setCategoryFilter] = useState<
    GrievanceCategory | "all"
  >("all");
  const [emailSearch, setEmailSearch] = useState("");

  // Detail modal
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(
    null
  );
  const [showModal, setShowModal] = useState(false);

  // Reply form
  const [replyBody, setReplyBody] = useState("");
  const [proposesClose, setProposesClose] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);

  // Priority edit
  const [editPriority, setEditPriority] = useState<GrievancePriority>("medium");
  const [priorityLoading, setPriorityLoading] = useState(false);

  // Force-close
  const [showForceClose, setShowForceClose] = useState(false);
  const [forceCloseReason, setForceCloseReason] = useState("");
  const [forceCloseLoading, setForceCloseLoading] = useState(false);

  // Fetch grievances
  const fetchGrievances = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (emailSearch) params.set("email", emailSearch);

      const res = await fetch(`/api/admin/grievances?${params}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load grievances");
      }

      const data = await res.json();
      setGrievances(data.grievances || []);
      setStats(data.stats || null);
    } catch (err) {
      console.error("Fetch grievances error:", err);
      setError((err as Error).message || "Failed to load grievances");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, emailSearch]);

  useEffect(() => {
    fetchGrievances();
  }, [fetchGrievances]);

  const openDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/grievances/${id}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load grievance details");
      }
      const data = await res.json();
      const g = data.grievance as Grievance;
      setSelectedGrievance(g);
      setEditPriority(g.priority);
      setReplyBody("");
      setProposesClose(false);
      setForceCloseReason("");
      setShowForceClose(false);
      setShowModal(true);
    } catch (err) {
      console.error("Fetch grievance details error:", err);
      alert((err as Error).message || "Failed to load grievance details");
    }
  };

  const refreshSelectedGrievance = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/grievances/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setSelectedGrievance(data.grievance as Grievance);
    } catch (err) {
      console.error("Refresh grievance details error:", err);
    }
  };

  // Post a reply (clarification or closure proposal)
  const handlePostMessage = async () => {
    if (!selectedGrievance || !csrfToken) return;
    if (replyBody.trim().length === 0) return;

    setReplyLoading(true);
    try {
      const res = await fetch(
        `/api/admin/grievances/${selectedGrievance.id}/message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({
            body: replyBody.trim(),
            proposesClose,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to post message");
      }
      setReplyBody("");
      setProposesClose(false);
      await refreshSelectedGrievance(selectedGrievance.id);
      fetchGrievances();
    } catch (err) {
      console.error("Post message error:", err);
      alert((err as Error).message);
    } finally {
      setReplyLoading(false);
    }
  };

  // Update priority (PATCH)
  const handleSavePriority = async () => {
    if (!selectedGrievance || !csrfToken) return;
    if (editPriority === selectedGrievance.priority) return;

    setPriorityLoading(true);
    try {
      const res = await fetch(
        `/api/admin/grievances/${selectedGrievance.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({ priority: editPriority }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update priority");
      }
      await refreshSelectedGrievance(selectedGrievance.id);
      fetchGrievances();
    } catch (err) {
      console.error("Update priority error:", err);
      alert((err as Error).message);
    } finally {
      setPriorityLoading(false);
    }
  };

  // Force-close (PATCH with forceClose+reason)
  const handleForceClose = async () => {
    if (!selectedGrievance || !csrfToken) return;
    if (forceCloseReason.trim().length < 20) {
      alert("Force-close reason must be at least 20 characters");
      return;
    }

    setForceCloseLoading(true);
    try {
      const res = await fetch(
        `/api/admin/grievances/${selectedGrievance.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({
            forceClose: true,
            forceCloseReason: forceCloseReason.trim(),
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to force-close grievance");
      }
      setShowForceClose(false);
      setForceCloseReason("");
      await refreshSelectedGrievance(selectedGrievance.id);
      fetchGrievances();
    } catch (err) {
      console.error("Force close error:", err);
      alert((err as Error).message);
    } finally {
      setForceCloseLoading(false);
    }
  };

  // Date helpers
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const isOverdue = (g: Grievance) => {
    if (g.status === "closed") return false;
    return new Date(g.sla_deadline) < new Date();
  };

  const getDaysToSla = (slaDeadline: string) => {
    const deadline = new Date(slaDeadline);
    const now = new Date();
    return Math.ceil(
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
  };

  const isClosed = selectedGrievance?.status === "closed";

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-700">{stats.open}</div>
            <div className="text-sm text-yellow-600">Open</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-700">
              {stats.inProgress}
            </div>
            <div className="text-sm text-blue-600">In Progress</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-purple-700">
              {stats.awaitingUser}
            </div>
            <div className="text-sm text-purple-600">Awaiting User</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-700">{stats.closed}</div>
            <div className="text-sm text-gray-600">Closed</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-700">{stats.overdue}</div>
            <div className="text-sm text-red-600">Overdue</div>
            <div className="text-xs text-red-500 mt-1">Past SLA</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as GrievanceStatus | "all")
          }
          className="border rounded-lg px-3 py-2"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="awaiting_user_response">Awaiting User</option>
          <option value="closed">Closed</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter(e.target.value as GrievanceCategory | "all")
          }
          className="border rounded-lg px-3 py-2"
        >
          <option value="all">All Categories</option>
          <option value="data_processing">Data Processing</option>
          <option value="correction">Correction</option>
          <option value="deletion">Deletion</option>
          <option value="consent">Consent</option>
          <option value="breach">Data Breach</option>
          <option value="other">Other</option>
        </select>

        <input
          type="text"
          placeholder="Search by email..."
          value={emailSearch}
          onChange={(e) => setEmailSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 w-64"
        />

        <button
          onClick={fetchGrievances}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Subject
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Priority
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                SLA Deadline
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : grievances.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No grievances found
                </td>
              </tr>
            ) : (
              grievances.map((g) => {
                const statusConfig = STATUS_CONFIG[g.status];
                const priorityConfig = PRIORITY_CONFIG[g.priority];
                const overdue = isOverdue(g);
                const daysToSla = getDaysToSla(g.sla_deadline);

                return (
                  <tr
                    key={g.id}
                    className={`hover:bg-gray-50 ${overdue ? "bg-red-50" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {g.email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900 max-w-xs truncate">
                        {g.subject}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {CATEGORY_LABELS[g.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}
                      >
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${priorityConfig.bgColor} ${priorityConfig.color}`}
                      >
                        {priorityConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div
                        className={`${overdue ? "text-red-600 font-medium" : "text-gray-500"}`}
                      >
                        {formatDate(g.sla_deadline)}
                      </div>
                      {g.status !== "closed" && (
                        <div
                          className={`text-xs ${overdue ? "text-red-500" : "text-gray-400"}`}
                        >
                          {overdue
                            ? `${Math.abs(daysToSla)}d overdue`
                            : `${daysToSla}d left`}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(g.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openDetail(g.id)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {showModal && selectedGrievance && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold">Grievance Details</h2>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${STATUS_CONFIG[selectedGrievance.status].bgColor} ${STATUS_CONFIG[selectedGrievance.status].color}`}
                    >
                      {STATUS_CONFIG[selectedGrievance.status].label}
                    </span>
                    <span className="text-xs text-gray-500">
                      ID: {selectedGrievance.id.slice(0, 8)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                  aria-label="Close"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Closure banner */}
                {isClosed && selectedGrievance.closed_by_role && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
                    <strong>Closed:</strong>{" "}
                    {CLOSED_BY_LABELS[selectedGrievance.closed_by_role]}
                    {selectedGrievance.closed_at && (
                      <> · {formatDateTime(selectedGrievance.closed_at)}</>
                    )}
                    {selectedGrievance.force_close_reason && (
                      <div className="mt-2">
                        <div className="text-xs text-gray-500">Reason:</div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap">
                          {selectedGrievance.force_close_reason}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Grievance Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Email</label>
                    <div className="font-medium">
                      {selectedGrievance.email || (
                        <span className="text-gray-400 italic">
                          [anonymised]
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Category</label>
                    <div>{CATEGORY_LABELS[selectedGrievance.category]}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Created</label>
                    <div>{formatDate(selectedGrievance.created_at)}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">SLA Deadline</label>
                    <div
                      className={
                        isOverdue(selectedGrievance)
                          ? "text-red-600 font-medium"
                          : ""
                      }
                    >
                      {formatDate(selectedGrievance.sla_deadline)}
                      {selectedGrievance.status !== "closed" && (
                        <span className="text-xs ml-2">
                          (
                          {getDaysToSla(selectedGrievance.sla_deadline) < 0
                            ? `${Math.abs(getDaysToSla(selectedGrievance.sla_deadline))}d overdue`
                            : `${getDaysToSla(selectedGrievance.sla_deadline)}d left`}
                          )
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subject & Description */}
                <div>
                  <label className="text-sm text-gray-500">Subject</label>
                  <div className="font-medium text-gray-900">
                    {selectedGrievance.subject || (
                      <span className="text-gray-400 italic">[anonymised]</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Description</label>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                    {selectedGrievance.description || (
                      <span className="text-gray-400 italic">[anonymised]</span>
                    )}
                  </div>
                </div>

                {/* Message thread */}
                <div className="border-t pt-4">
                  <h3 className="font-medium text-gray-900 mb-3">
                    Conversation
                  </h3>
                  {(!selectedGrievance.messages ||
                    selectedGrievance.messages.length === 0) && (
                    <p className="text-sm text-gray-400 italic">
                      No correspondence yet.
                    </p>
                  )}
                  <div className="space-y-3">
                    {selectedGrievance.messages?.map((m) => {
                      const isAdmin = m.author_role === "admin";
                      return (
                        <div
                          key={m.id}
                          className={`rounded-lg p-3 ${
                            isAdmin
                              ? "bg-blue-50 border border-blue-100"
                              : "bg-gray-50 border border-gray-200"
                          }`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span
                              className={`text-xs font-medium ${
                                isAdmin ? "text-blue-700" : "text-gray-700"
                              }`}
                            >
                              {isAdmin ? "Admin" : "Customer"}
                              {m.proposes_close && (
                                <span className="ml-2 inline-flex px-1.5 py-0.5 text-xs rounded bg-purple-100 text-purple-700">
                                  Proposed closure
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-gray-400">
                              {formatDateTime(m.created_at)}
                            </span>
                          </div>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap">
                            {m.body || (
                              <span className="text-gray-400 italic">
                                [anonymised]
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Reply form (hidden when closed) */}
                {!isClosed && (
                  <div className="border-t pt-4 space-y-3">
                    <h3 className="font-medium text-gray-900">Post a reply</h3>
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      rows={4}
                      placeholder="Write your reply to the customer..."
                      className="w-full border rounded-lg px-3 py-2 resize-vertical"
                      maxLength={5000}
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={proposesClose}
                          onChange={(e) => setProposesClose(e.target.checked)}
                        />
                        <span>
                          Propose to close — moves the grievance to{" "}
                          <em>awaiting user</em> for accept/dispute
                        </span>
                      </label>
                      <button
                        onClick={handlePostMessage}
                        disabled={
                          replyLoading || replyBody.trim().length === 0
                        }
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {replyLoading
                          ? "Posting..."
                          : proposesClose
                            ? "Send proposal"
                            : "Send reply"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Priority (always editable) */}
                <div className="border-t pt-4">
                  <h3 className="font-medium text-gray-900 mb-2">Priority</h3>
                  <div className="flex items-center gap-3">
                    <select
                      value={editPriority}
                      onChange={(e) =>
                        setEditPriority(e.target.value as GrievancePriority)
                      }
                      className="border rounded-lg px-3 py-2"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <button
                      onClick={handleSavePriority}
                      disabled={
                        priorityLoading ||
                        editPriority === selectedGrievance.priority
                      }
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm"
                    >
                      {priorityLoading ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>

                {/* Force-close (admin escape hatch) */}
                {!isClosed && (
                  <div className="border-t pt-4">
                    {!showForceClose ? (
                      <button
                        onClick={() => setShowForceClose(true)}
                        className="text-sm text-red-600 hover:text-red-800 underline"
                      >
                        Force-close this grievance
                      </button>
                    ) : (
                      <div className="space-y-2 bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm font-medium text-red-700">
                          Force-close (without user acceptance)
                        </p>
                        <p className="text-xs text-red-600">
                          The reason below is logged and emailed to the user.
                          It is admin-authored audit copy and is NOT anonymised
                          by the daily cron.
                        </p>
                        <textarea
                          value={forceCloseReason}
                          onChange={(e) => setForceCloseReason(e.target.value)}
                          rows={3}
                          placeholder="Why are you force-closing? (≥20 chars)"
                          minLength={20}
                          maxLength={2000}
                          className="w-full border rounded-lg px-3 py-2 text-sm resize-vertical"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setShowForceClose(false);
                              setForceCloseReason("");
                            }}
                            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleForceClose}
                            disabled={
                              forceCloseLoading ||
                              forceCloseReason.trim().length < 20
                            }
                            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            {forceCloseLoading
                              ? "Closing..."
                              : "Confirm force-close"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Close modal */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
