"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useCsrf } from "@/hooks/useCsrf";

// Types
type GrievanceStatus = "open" | "in_progress" | "resolved" | "closed";
type GrievanceCategory =
  | "data_processing"
  | "correction"
  | "deletion"
  | "consent"
  | "breach"
  | "other";
type GrievancePriority = "low" | "medium" | "high";

type Grievance = {
  id: string;
  email: string;
  subject: string;
  description: string;
  category: GrievanceCategory;
  status: GrievanceStatus;
  priority: GrievancePriority;
  admin_notes: string | null;
  resolution_notes: string | null;
  sla_deadline: string;
  resolved_at: string | null;
  resolved_by: string | null;
  ip_address: string | null;
  created_at: string;
  updated_at: string;
};

type GrievanceStats = {
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  overdue: number;
};

// Status configuration
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
  resolved: {
    label: "Resolved",
    color: "text-green-700",
    bgColor: "bg-green-100",
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

  // Modal state
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(
    null
  );
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit form state
  const [editStatus, setEditStatus] = useState<GrievanceStatus>("open");
  const [editPriority, setEditPriority] = useState<GrievancePriority>("medium");
  const [editAdminNotes, setEditAdminNotes] = useState("");
  const [editResolutionNotes, setEditResolutionNotes] = useState("");

  // Fetch grievances
  const fetchGrievances = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (categoryFilter !== "all") {
        params.set("category", categoryFilter);
      }
      if (emailSearch) {
        params.set("email", emailSearch);
      }

      const res = await fetch(`/api/admin/grievances?${params}`);
      if (!res.ok) throw new Error("Failed to fetch grievances");

      const data = await res.json();
      setGrievances(data.grievances || []);
      setStats(data.stats || null);
    } catch (err) {
      console.error("Fetch grievances error:", err);
      setError("Failed to load grievances");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, emailSearch]);

  useEffect(() => {
    fetchGrievances();
  }, [fetchGrievances]);

  // Open detail modal
  const openDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/grievances/${id}`);
      if (!res.ok) throw new Error("Failed to fetch grievance details");
      const data = await res.json();
      const g = data.grievance as Grievance;
      setSelectedGrievance(g);
      setEditStatus(g.status);
      setEditPriority(g.priority);
      setEditAdminNotes(g.admin_notes || "");
      setEditResolutionNotes(g.resolution_notes || "");
      setShowModal(true);
    } catch (err) {
      console.error("Fetch grievance details error:", err);
    }
  };

  // Update grievance
  const handleUpdate = async () => {
    if (!selectedGrievance || !csrfToken) return;

    setActionLoading(true);
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
            status: editStatus,
            priority: editPriority,
            adminNotes: editAdminNotes || undefined,
            resolutionNotes: editResolutionNotes || undefined,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update grievance");
      }

      setShowModal(false);
      fetchGrievances();
    } catch (err) {
      console.error("Update grievance error:", err);
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Check if SLA is overdue
  const isOverdue = (g: Grievance) => {
    if (g.status === "resolved" || g.status === "closed") return false;
    return new Date(g.sla_deadline) < new Date();
  };

  // Days until SLA deadline
  const getDaysToSla = (slaDeadline: string) => {
    const deadline = new Date(slaDeadline);
    const now = new Date();
    return Math.ceil(
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-700">
              {stats.open}
            </div>
            <div className="text-sm text-yellow-600">Open</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-700">
              {stats.inProgress}
            </div>
            <div className="text-sm text-blue-600">In Progress</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-700">
              {stats.resolved}
            </div>
            <div className="text-sm text-green-600">Resolved</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-700">
              {stats.closed}
            </div>
            <div className="text-sm text-gray-600">Closed</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-700">
              {stats.overdue}
            </div>
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
          <option value="resolved">Resolved</option>
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
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  Loading...
                </td>
              </tr>
            ) : grievances.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-gray-500"
                >
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
                      {g.status !== "resolved" && g.status !== "closed" && (
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
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold">Grievance Details</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-500 hover:text-gray-700"
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
                {/* Grievance Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Email</label>
                    <div className="font-medium">
                      {selectedGrievance.email}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Category</label>
                    <div>
                      {CATEGORY_LABELS[selectedGrievance.category]}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Created</label>
                    <div>{formatDate(selectedGrievance.created_at)}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">
                      SLA Deadline
                    </label>
                    <div
                      className={
                        isOverdue(selectedGrievance)
                          ? "text-red-600 font-medium"
                          : ""
                      }
                    >
                      {formatDate(selectedGrievance.sla_deadline)}
                      {selectedGrievance.status !== "resolved" &&
                        selectedGrievance.status !== "closed" && (
                          <span className="text-xs ml-2">
                            ({getDaysToSla(selectedGrievance.sla_deadline) < 0
                              ? `${Math.abs(getDaysToSla(selectedGrievance.sla_deadline))}d overdue`
                              : `${getDaysToSla(selectedGrievance.sla_deadline)}d left`})
                          </span>
                        )}
                    </div>
                  </div>
                  {selectedGrievance.resolved_at && (
                    <div>
                      <label className="text-sm text-gray-500">
                        Resolved At
                      </label>
                      <div>{formatDate(selectedGrievance.resolved_at)}</div>
                    </div>
                  )}
                </div>

                {/* Subject & Description */}
                <div>
                  <label className="text-sm text-gray-500">Subject</label>
                  <div className="font-medium text-gray-900">
                    {selectedGrievance.subject}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Description</label>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                    {selectedGrievance.description}
                  </div>
                </div>

                {/* Admin Form */}
                <div className="border-t pt-4 space-y-4">
                  <h3 className="font-medium text-gray-900">Admin Actions</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status
                      </label>
                      <select
                        value={editStatus}
                        onChange={(e) =>
                          setEditStatus(e.target.value as GrievanceStatus)
                        }
                        className="w-full border rounded-lg px-3 py-2"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Priority
                      </label>
                      <select
                        value={editPriority}
                        onChange={(e) =>
                          setEditPriority(e.target.value as GrievancePriority)
                        }
                        className="w-full border rounded-lg px-3 py-2"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Admin Notes (internal)
                    </label>
                    <textarea
                      value={editAdminNotes}
                      onChange={(e) => setEditAdminNotes(e.target.value)}
                      rows={3}
                      placeholder="Internal notes about this grievance..."
                      className="w-full border rounded-lg px-3 py-2 resize-vertical"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Resolution Notes (sent to customer)
                    </label>
                    <textarea
                      value={editResolutionNotes}
                      onChange={(e) => setEditResolutionNotes(e.target.value)}
                      rows={3}
                      placeholder="Resolution details visible to the customer..."
                      className="w-full border rounded-lg px-3 py-2 resize-vertical"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {actionLoading ? "Saving..." : "Save Changes"}
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
