"use client";

import React, { useEffect, useState, useCallback } from "react";

// Types
type DeletionStatus =
  | "pending"
  | "deferred_legal"
  | "cancelled"
  | "completed";

type DeletionRequest = {
  id: string;
  guest_email: string;
  status: DeletionStatus;
  requested_at: string;
  scheduled_deletion_at: string;
  cancelled_at: string | null;
  completed_at: string | null;
  has_paid_orders: boolean;
  paid_orders_count: number;
  unpaid_orders_count: number;
  earliest_order_fy: string | null;
  retention_end_date: string | null;
  orders_count: number;
  otp_cleared: boolean;
  created_at: string;
};

type DeletionStats = {
  pending: number;
  deferredLegal: number;
  completed: number;
  cancelled: number;
  dueNext7Days: number;
};

type OrderInfo = {
  id: string;
  payment_status: string;
  created_at: string;
  total_amount: number;
};

// Status configuration
const STATUS_CONFIG: Record<
  DeletionStatus,
  { label: string; color: string; bgColor: string }
> = {
  pending: { label: "Pending", color: "text-yellow-700", bgColor: "bg-yellow-100" },
  deferred_legal: { label: "Deferred (Tax)", color: "text-blue-700", bgColor: "bg-blue-100" },
  cancelled: { label: "Cancelled", color: "text-gray-700", bgColor: "bg-gray-100" },
  completed: { label: "Completed", color: "text-green-700", bgColor: "bg-green-100" },
};

export default function DeletionRequestsTab() {
  // State
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [stats, setStats] = useState<DeletionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<DeletionStatus | "all">("all");
  const [emailSearch, setEmailSearch] = useState("");

  // Modal state
  const [selectedRequest, setSelectedRequest] = useState<DeletionRequest | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<OrderInfo[]>([]);
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

      const res = await fetch(`/api/admin/deletion-requests?${params}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load deletion requests");
      }

      const data = await res.json();
      setRequests(data.requests || []);
      setStats(data.stats || null);
    } catch (err) {
      console.error("Fetch deletion requests error:", err);
      setError((err as Error).message || "Failed to load deletion requests");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, emailSearch]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Fetch request details
  const fetchRequestDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/deletion-requests/${id}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load request details");
      }
      const data = await res.json();
      setSelectedRequest(data.request);
      setSelectedOrders(data.orders || []);
      setShowModal(true);
    } catch (err) {
      console.error("Fetch request details error:", err);
      alert((err as Error).message || "Failed to load request details");
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

  // Calculate days remaining
  const getDaysRemaining = (scheduledAt: string) => {
    const scheduled = new Date(scheduledAt);
    const now = new Date();
    const days = Math.ceil(
      (scheduled.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return Math.max(0, days);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
            <div className="text-sm text-yellow-600">Pending</div>
            <div className="text-xs text-yellow-500 mt-1">Cooling-off window</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-700">{stats.deferredLegal}</div>
            <div className="text-sm text-blue-600">Deferred</div>
            <div className="text-xs text-blue-500 mt-1">Tax Retention</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-700">{stats.completed}</div>
            <div className="text-sm text-green-600">Completed</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-700">{stats.cancelled}</div>
            <div className="text-sm text-gray-600">Cancelled</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-purple-700">
              {stats.dueNext7Days}
            </div>
            <div className="text-sm text-purple-600">Due Next 7 Days</div>
            <div className="text-xs text-purple-500 mt-1">Auto-executed by cron</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DeletionStatus | "all")}
          className="border rounded-lg px-3 py-2"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="deferred_legal">Deferred (Tax)</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
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

        <div className="ml-auto text-sm text-gray-500">
          Deletions run automatically via daily cron after the 14-day window.
        </div>
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
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Requested
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Scheduled / Retention
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Orders
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
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
                  No deletion requests found
                </td>
              </tr>
            ) : (
              requests.map((req) => {
                const config = STATUS_CONFIG[req.status];
                const daysRemaining =
                  req.status === "pending"
                    ? getDaysRemaining(req.scheduled_deletion_at)
                    : null;

                return (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {req.guest_email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.color}`}
                      >
                        {config.label}
                      </span>
                      {daysRemaining !== null && (
                        <span className="ml-2 text-xs text-gray-500">
                          {daysRemaining}d left
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(req.requested_at)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {req.status === "deferred_legal" && req.retention_end_date ? (
                        <div>
                          <div className="text-blue-600 font-medium">
                            Until {req.retention_end_date}
                          </div>
                          <div className="text-xs text-gray-500">
                            FY {req.earliest_order_fy}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500">
                          {formatDate(req.scheduled_deletion_at)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="text-gray-900">{req.orders_count} total</div>
                      {req.has_paid_orders && (
                        <div className="text-xs text-blue-600">
                          {req.paid_orders_count} paid
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => fetchRequestDetails(req.id)}
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
      {showModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold">Deletion Request Details</h2>
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
                    <div className="font-medium">{selectedRequest.guest_email}</div>
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
                    <label className="text-sm text-gray-500">Requested At</label>
                    <div>{formatDate(selectedRequest.requested_at)}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Scheduled Deletion</label>
                    <div>{formatDate(selectedRequest.scheduled_deletion_at)}</div>
                  </div>
                  {selectedRequest.retention_end_date && (
                    <>
                      <div>
                        <label className="text-sm text-gray-500">Retention End Date</label>
                        <div className="text-blue-600 font-medium">
                          {selectedRequest.retention_end_date}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500">Financial Year</label>
                        <div>{selectedRequest.earliest_order_fy}</div>
                      </div>
                    </>
                  )}
                </div>

                {/* Order Stats */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium mb-2">Order Summary</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">{selectedRequest.orders_count}</div>
                      <div className="text-sm text-gray-500">Total</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">
                        {selectedRequest.paid_orders_count}
                      </div>
                      <div className="text-sm text-gray-500">Paid (Retained)</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-600">
                        {selectedRequest.unpaid_orders_count}
                      </div>
                      <div className="text-sm text-gray-500">Unpaid</div>
                    </div>
                  </div>
                </div>

                {/* Associated Orders */}
                {selectedOrders.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Associated Orders</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                              Order ID
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                              Payment Status
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                              Amount
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                              Date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {selectedOrders.map((order) => (
                            <tr key={order.id}>
                              <td className="px-3 py-2 text-sm font-mono">
                                {order.id.slice(0, 8)}...
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs rounded-full ${
                                    order.payment_status === "paid"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-gray-100 text-gray-700"
                                  }`}
                                >
                                  {order.payment_status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-sm">
                                ₹{order.total_amount}
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-500">
                                {formatDate(order.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tax Compliance Notice */}
                {selectedRequest.has_paid_orders && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-800 mb-1">Tax Compliance Notice</h4>
                    <p className="text-sm text-blue-700">
                      This customer has {selectedRequest.paid_orders_count} paid order(s).
                      Per GST Act and Income Tax Act, these records must be retained until{" "}
                      <strong>{selectedRequest.retention_end_date}</strong>.
                      Only OTP data can be cleared; customer details will be preserved.
                    </p>
                  </div>
                )}

                {/* Close */}
                <div className="flex justify-end pt-4 border-t">
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
