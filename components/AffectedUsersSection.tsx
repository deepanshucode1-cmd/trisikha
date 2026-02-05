"use client";

import React, { useState, useCallback } from "react";

// Types
type NotificationStatus = "pending" | "sent" | "failed" | "not_required";
type VendorType = "razorpay" | "shiprocket";

type AffectedUser = {
  id: string;
  incident_id: string;
  order_id: string | null;
  guest_email: string;
  guest_phone: string | null;
  affected_data_types: string[];
  notification_status: NotificationStatus;
  notified_at: string | null;
  notification_error: string | null;
  created_at: string;
};

type AffectedUsersSummary = {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  notRequired: number;
};

interface AffectedUsersSectionProps {
  incidentId: string;
  incidentType?: string;
  onClose?: () => void;
}

// Status configuration
const STATUS_CONFIG: Record<
  NotificationStatus,
  { label: string; color: string; bgColor: string }
> = {
  pending: { label: "Pending", color: "text-yellow-700", bgColor: "bg-yellow-100" },
  sent: { label: "Sent", color: "text-green-700", bgColor: "bg-green-100" },
  failed: { label: "Failed", color: "text-red-700", bgColor: "bg-red-100" },
  not_required: { label: "Not Required", color: "text-gray-700", bgColor: "bg-gray-100" },
};

const DATA_TYPE_LABELS: Record<string, string> = {
  email: "Email Address",
  phone: "Phone Number",
  address: "Address",
  payment_info: "Payment Info",
  order_details: "Order Details",
};

export default function AffectedUsersSection({
  incidentId,
  incidentType: _incidentType,
  onClose,
}: AffectedUsersSectionProps) {
  // incidentType can be used for future enhancements (e.g., pre-selecting vendor type)
  void _incidentType;
  // State
  const [users, setUsers] = useState<AffectedUser[]>([]);
  const [summary, setSummary] = useState<AffectedUsersSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Identify form state
  const [showIdentifyForm, setShowIdentifyForm] = useState(false);
  const [identifyForm, setIdentifyForm] = useState({
    vendorType: "razorpay" as VendorType,
    breachStartDate: "",
    breachEndDate: "",
  });
  const [identifyLoading, setIdentifyLoading] = useState(false);
  const [identifyResult, setIdentifyResult] = useState<string | null>(null);

  // Notify state
  const [notifyLoading, setNotifyLoading] = useState(false);

  // Add user form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    email: "",
    phone: "",
    affectedDataTypes: [] as string[],
  });

  // Fetch affected users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/incidents/${incidentId}/affected-users`);
      if (!res.ok) throw new Error("Failed to fetch affected users");

      const data = await res.json();
      setUsers(data.users || []);
      setSummary(data.summary || null);
      setHasLoaded(true);
    } catch (err) {
      console.error("Fetch affected users error:", err);
      setError("Failed to load affected users");
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  // Load on mount
  React.useEffect(() => {
    if (!hasLoaded) {
      fetchUsers();
    }
  }, [fetchUsers, hasLoaded]);

  // Identify affected users (Option C)
  const handleIdentify = async () => {
    if (!identifyForm.breachStartDate || !identifyForm.breachEndDate) {
      alert("Please select both start and end dates");
      return;
    }

    setIdentifyLoading(true);
    setIdentifyResult(null);

    try {
      const res = await fetch(`/api/admin/incidents/${incidentId}/affected-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "identify",
          vendorType: identifyForm.vendorType,
          breachStartDate: identifyForm.breachStartDate,
          breachEndDate: identifyForm.breachEndDate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to identify users");
      }

      setIdentifyResult(
        `Found ${data.usersIdentified} users. Added ${data.usersAdded} new, ${data.alreadyTracked} already tracked.`
      );
      setShowIdentifyForm(false);
      fetchUsers();
    } catch (err) {
      console.error("Identify users error:", err);
      alert((err as Error).message);
    } finally {
      setIdentifyLoading(false);
    }
  };

  // Add single user manually
  const handleAddUser = async () => {
    if (!addForm.email) {
      alert("Email is required");
      return;
    }
    if (addForm.affectedDataTypes.length === 0) {
      alert("Select at least one affected data type");
      return;
    }

    try {
      const res = await fetch(`/api/admin/incidents/${incidentId}/affected-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          email: addForm.email,
          phone: addForm.phone || undefined,
          affectedDataTypes: addForm.affectedDataTypes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add user");
      }

      setShowAddForm(false);
      setAddForm({ email: "", phone: "", affectedDataTypes: [] });
      fetchUsers();
    } catch (err) {
      console.error("Add user error:", err);
      alert((err as Error).message);
    }
  };

  // Notify all pending users
  const handleNotifyAll = async () => {
    if (!summary || summary.pending === 0) {
      alert("No pending users to notify");
      return;
    }

    if (!confirm(`Send notification to ${summary.pending} users?`)) {
      return;
    }

    setNotifyLoading(true);

    try {
      const res = await fetch(`/api/admin/incidents/${incidentId}/affected-users/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notify_all" }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to notify users");
      }

      alert(`Notification complete:\n- Sent: ${data.sent}\n- Failed: ${data.failed}\n- Skipped: ${data.skipped}`);
      fetchUsers();
    } catch (err) {
      console.error("Notify all error:", err);
      alert((err as Error).message);
    } finally {
      setNotifyLoading(false);
    }
  };

  // Notify single user
  const handleNotifySingle = async (affectedUserId: string) => {
    if (!confirm("Send notification to this user?")) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/incidents/${incidentId}/affected-users/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notify_single", affectedUserId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to notify user");
      }

      alert("Notification sent successfully");
      fetchUsers();
    } catch (err) {
      console.error("Notify single error:", err);
      alert((err as Error).message);
    }
  };

  // Toggle data type selection
  const toggleDataType = (type: string) => {
    setAddForm((prev) => ({
      ...prev,
      affectedDataTypes: prev.affectedDataTypes.includes(type)
        ? prev.affectedDataTypes.filter((t) => t !== type)
        : [...prev.affectedDataTypes, type],
    }));
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Affected Users</h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-gray-50 border rounded-lg p-3 text-center">
            <div className="text-xl font-bold">{summary.total}</div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-yellow-700">{summary.pending}</div>
            <div className="text-xs text-yellow-600">Pending</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-green-700">{summary.sent}</div>
            <div className="text-xs text-green-600">Sent</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-red-700">{summary.failed}</div>
            <div className="text-xs text-red-600">Failed</div>
          </div>
          <div className="bg-gray-50 border rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-gray-700">{summary.notRequired}</div>
            <div className="text-xs text-gray-500">N/A</div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowIdentifyForm(true)}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          Identify by Date Range
        </button>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
        >
          Add Manually
        </button>
        <button
          onClick={handleNotifyAll}
          disabled={notifyLoading || !summary || summary.pending === 0}
          className="px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm disabled:opacity-50"
        >
          {notifyLoading ? "Sending..." : `Notify All Pending (${summary?.pending || 0})`}
        </button>
        <button
          onClick={fetchUsers}
          className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Result message */}
      {identifyResult && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">
          {identifyResult}
        </div>
      )}

      {/* Identify Form Modal */}
      {showIdentifyForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium mb-4">Identify Affected Users</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vendor Type
                </label>
                <select
                  value={identifyForm.vendorType}
                  onChange={(e) =>
                    setIdentifyForm((prev) => ({
                      ...prev,
                      vendorType: e.target.value as VendorType,
                    }))
                  }
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="razorpay">Razorpay (Payment)</option>
                  <option value="shiprocket">Shiprocket (Shipping)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Breach Start Date
                </label>
                <input
                  type="date"
                  value={identifyForm.breachStartDate}
                  onChange={(e) =>
                    setIdentifyForm((prev) => ({
                      ...prev,
                      breachStartDate: e.target.value,
                    }))
                  }
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Breach End Date
                </label>
                <input
                  type="date"
                  value={identifyForm.breachEndDate}
                  onChange={(e) =>
                    setIdentifyForm((prev) => ({
                      ...prev,
                      breachEndDate: e.target.value,
                    }))
                  }
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div className="text-sm text-gray-500">
                This will query all orders in the date range and add them as affected users.
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowIdentifyForm(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleIdentify}
                  disabled={identifyLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {identifyLoading ? "Identifying..." : "Identify Users"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add User Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium mb-4">Add Affected User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) =>
                    setAddForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={addForm.phone}
                  onChange={(e) =>
                    setAddForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Affected Data Types *
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(DATA_TYPE_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleDataType(key)}
                      className={`px-3 py-1 rounded-full text-sm ${
                        addForm.affectedDataTypes.includes(key)
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddUser}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Phone
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Affected Data
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No affected users found. Use &quot;Identify by Date Range&quot; to find affected users.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const statusConfig = STATUS_CONFIG[user.notification_status];
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{user.guest_email}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {user.guest_phone || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.affected_data_types.map((type) => (
                          <span
                            key={type}
                            className="inline-flex px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                          >
                            {DATA_TYPE_LABELS[type] || type}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}
                      >
                        {statusConfig.label}
                      </span>
                      {user.notified_at && (
                        <div className="text-xs text-gray-500 mt-1">
                          {formatDate(user.notified_at)}
                        </div>
                      )}
                      {user.notification_error && (
                        <div className="text-xs text-red-500 mt-1">
                          {user.notification_error}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.notification_status === "pending" && (
                        <button
                          onClick={() => handleNotifySingle(user.id)}
                          className="text-orange-600 hover:text-orange-800 text-sm"
                        >
                          Notify
                        </button>
                      )}
                      {user.notification_status === "failed" && (
                        <button
                          onClick={() => handleNotifySingle(user.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
