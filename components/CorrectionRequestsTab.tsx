"use client";

import React, { useEffect, useState, useCallback } from "react";

// Types
type CorrectionStatus = "pending" | "approved" | "rejected";
type CorrectionFieldName = "name" | "email" | "phone" | "address";

type CorrectionRequest = {
  id: string;
  email: string;
  order_id: string;
  field_name: CorrectionFieldName;
  current_value: string;
  requested_value: string;
  status: CorrectionStatus;
  admin_notes: string | null;
  processed_at: string | null;
  processed_by: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
};

type CorrectionStats = {
  pending: number;
  approved: number;
  rejected: number;
};

// Status configuration
const STATUS_CONFIG: Record<
  CorrectionStatus,
  { label: string; color: string; bgColor: string }
> = {
  pending: { label: "Pending", color: "text-yellow-700", bgColor: "bg-yellow-100" },
  approved: { label: "Applied", color: "text-green-700", bgColor: "bg-green-100" },
  rejected: { label: "Rejected", color: "text-red-700", bgColor: "bg-red-100" },
};

const FIELD_LABELS: Record<CorrectionFieldName, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  address: "Address",
};

export default function CorrectionRequestsTab() {
  // State
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [stats, setStats] = useState<CorrectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<CorrectionStatus | "all">("all");
  const [emailSearch, setEmailSearch] = useState("");

  // Modal state
  const [selectedRequest, setSelectedRequest] = useState<CorrectionRequest | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Fetch requests
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (emailSearch) {
        params.set("email", emailSearch);
      }

      const res = await fetch(`/api/admin/corrections?${params}`);
      if (!res.ok) throw new Error("Failed to fetch correction requests");

      const data = await res.json();
      setRequests(data.requests || []);
      setStats(data.stats || null);
    } catch (err) {
      console.error("Fetch correction requests error:", err);
      setError("Failed to load correction requests");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, emailSearch]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Open detail modal
  const openDetailModal = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/corrections/${id}`);
      if (!res.ok) throw new Error("Failed to fetch request details");
      const data = await res.json();
      setSelectedRequest(data.request);
      setShowModal(true);
    } catch (err) {
      console.error("Fetch request details error:", err);
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Truncate long values
  const truncate = (str: string, maxLen: number) => {
    return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          Corrections are applied immediately when guests submit them. Only orders with <strong>CONFIRMED</strong> status are eligible. This tab is a read-only audit trail.
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-700">{stats.approved}</div>
            <div className="text-sm text-green-600">Applied</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-700">{stats.rejected}</div>
            <div className="text-sm text-red-600">Rejected</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CorrectionStatus | "all")}
          className="border rounded-lg px-3 py-2"
        >
          <option value="all">All Status</option>
          <option value="approved">Applied</option>
          <option value="rejected">Rejected</option>
        </select>

        <input
          type="text"
          placeholder="Search by email..."
          value={emailSearch}
          onChange={(e) => setEmailSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 w-64"
        />

        <button
          onClick={fetchRequests}
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
                Email / Order
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Field
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Change
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No correction requests found
                </td>
              </tr>
            ) : (
              requests.map((req) => {
                const config = STATUS_CONFIG[req.status];

                return (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {req.email}
                      </div>
                      <div className="text-xs text-gray-500">
                        Order: {req.order_id.slice(0, 8)}...
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                        {FIELD_LABELS[req.field_name]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="text-gray-500 line-through">{truncate(req.current_value, 30)}</div>
                      <div className="text-gray-900">{truncate(req.requested_value, 30)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.color}`}
                      >
                        {config.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(req.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openDetailModal(req.id)}
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

      {/* Detail Modal (read-only) */}
      {showModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold">Correction Details</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Request Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Email</label>
                    <div className="font-medium">{selectedRequest.email}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Status</label>
                    <div>
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${STATUS_CONFIG[selectedRequest.status].bgColor} ${STATUS_CONFIG[selectedRequest.status].color}`}
                      >
                        {STATUS_CONFIG[selectedRequest.status].label}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Field</label>
                    <div className="font-medium">{FIELD_LABELS[selectedRequest.field_name]}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Submitted At</label>
                    <div>{formatDate(selectedRequest.created_at)}</div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm text-gray-500">Order ID</label>
                    <div className="font-mono text-sm">{selectedRequest.order_id}</div>
                  </div>
                </div>

                {/* Value Comparison */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium mb-3">Applied Change</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase">Previous Value</label>
                      <div className="mt-1 p-3 bg-red-50 border border-red-200 rounded text-sm break-all">
                        {selectedRequest.current_value}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase">Corrected Value</label>
                      <div className="mt-1 p-3 bg-green-50 border border-green-200 rounded text-sm break-all">
                        {selectedRequest.requested_value}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Processing Info */}
                {selectedRequest.processed_at && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium mb-2">Processing Info</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <label className="text-gray-500">Applied At</label>
                        <div>{formatDate(selectedRequest.processed_at)}</div>
                      </div>
                      {selectedRequest.admin_notes && (
                        <div className="col-span-2">
                          <label className="text-gray-500">Notes</label>
                          <div className="mt-1">{selectedRequest.admin_notes}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Audit Info */}
                <div className="text-xs text-gray-400 space-y-1">
                  {selectedRequest.ip_address && <p>IP: {selectedRequest.ip_address}</p>}
                  {selectedRequest.user_agent && <p className="truncate">UA: {selectedRequest.user_agent}</p>}
                </div>

                {/* Close button */}
                <div className="border-t pt-4 flex justify-end">
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
