"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useCsrf } from "@/hooks/useCsrf";

// --- Types ---
type IncidentSeverity = "low" | "medium" | "high" | "critical";
type IncidentStatus = "open" | "investigating" | "resolved" | "false_positive";
type RemediationStatus = "pending" | "in_progress" | "completed";
type TabType = "incidents" | "vendor-breaches";

type VendorBreach = {
  id: string;
  vendor_name: string;
  breach_description: string;
  affected_data_types: string[];
  breach_occurred_at?: string;
  vendor_notified_us_at: string;
  we_notified_dpb_at?: string;
  users_notified_at?: string;
  affected_user_count?: number;
  risk_level: IncidentSeverity;
  containment_actions?: string[];
  remediation_status: RemediationStatus;
  vendor_reference_id?: string;
  internal_incident_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
};

type Incident = {
  id: string;
  incident_type: string;
  severity: IncidentSeverity;
  source_ip?: string;
  order_id?: string;
  admin_user_id?: string;
  guest_email?: string;
  endpoint?: string;
  description: string;
  details?: Record<string, unknown>;
  status: IncidentStatus;
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
  notes?: string;
};

type Stats = Record<IncidentSeverity, number>;

// --- Configuration ---
const SEVERITY_CONFIG: Record<IncidentSeverity, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  critical: {
    label: "Critical",
    color: "text-red-700",
    bgColor: "bg-red-100",
    borderColor: "border-red-300",
  },
  high: {
    label: "High",
    color: "text-orange-700",
    bgColor: "bg-orange-100",
    borderColor: "border-orange-300",
  },
  medium: {
    label: "Medium",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
    borderColor: "border-yellow-300",
  },
  low: {
    label: "Low",
    color: "text-green-700",
    bgColor: "bg-green-100",
    borderColor: "border-green-300",
  },
};

const STATUS_CONFIG: Record<IncidentStatus, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  open: { label: "Open", color: "text-red-600", bgColor: "bg-red-50" },
  investigating: { label: "Investigating", color: "text-blue-600", bgColor: "bg-blue-50" },
  resolved: { label: "Resolved", color: "text-green-600", bgColor: "bg-green-50" },
  false_positive: { label: "False Positive", color: "text-gray-600", bgColor: "bg-gray-50" },
};

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  // Existing types
  rate_limit_exceeded: "Rate Limit Exceeded",
  payment_signature_invalid: "Payment Signature Invalid",
  webhook_signature_invalid: "Webhook Signature Invalid",
  otp_brute_force: "OTP Brute Force",
  unauthorized_access: "Unauthorized Access",
  suspicious_pattern: "Suspicious Pattern",
  admin_auth_failure: "Admin Auth Failure",
  // CIA Triad - Confidentiality
  bulk_data_export: "Bulk Data Export",
  unauthorized_data_access: "Unauthorized Data Access",
  // CIA Triad - Integrity
  data_modification_anomaly: "Data Modification Anomaly",
  schema_change_detected: "Schema Change Detected",
  // CIA Triad - Availability
  service_disruption: "Service Disruption",
  data_deletion_alert: "Data Deletion Alert",
  backup_failure: "Backup Failure",
};

const REMEDIATION_STATUS_CONFIG: Record<RemediationStatus, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  pending: { label: "Pending", color: "text-yellow-600", bgColor: "bg-yellow-50" },
  in_progress: { label: "In Progress", color: "text-blue-600", bgColor: "bg-blue-50" },
  completed: { label: "Completed", color: "text-green-600", bgColor: "bg-green-50" },
};

const VENDOR_OPTIONS = [
  { value: "razorpay", label: "Razorpay" },
  { value: "shiprocket", label: "Shiprocket" },
  { value: "supabase", label: "Supabase" },
  { value: "other", label: "Other" },
];

const DATA_TYPE_OPTIONS = [
  { value: "email", label: "Email Address" },
  { value: "phone", label: "Phone Number" },
  { value: "name", label: "Name" },
  { value: "address", label: "Shipping/Billing Address" },
  { value: "payment_info", label: "Payment Information" },
  { value: "order_history", label: "Order History" },
  { value: "password", label: "Password/Credentials" },
  { value: "other", label: "Other PII" },
];

export default function SecurityDashboard() {
  const { csrfFetch, getCsrfHeaders } = useCsrf();

  // --- State ---
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats] = useState<Stats>({ low: 0, medium: 0, high: 0, critical: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "all">("open");
  const [severityFilter, setSeverityFilter] = useState<IncidentSeverity | "all">("all");

  // Modal state
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [newStatus, setNewStatus] = useState<IncidentStatus>("open");
  const [notes, setNotes] = useState("");

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>("incidents");

  // Vendor Breach state
  const [vendorBreaches, setVendorBreaches] = useState<VendorBreach[]>([]);
  const [breachLoading, setBreachLoading] = useState(false);
  const [showBreachForm, setShowBreachForm] = useState(false);
  const [selectedBreach, setSelectedBreach] = useState<VendorBreach | null>(null);
  const [showBreachModal, setShowBreachModal] = useState(false);

  // Breach form state
  const [breachForm, setBreachForm] = useState({
    vendorName: "razorpay" as string,
    customVendorName: "",
    breachDescription: "",
    affectedDataTypes: [] as string[],
    breachOccurredAt: "",
    affectedUserCount: "",
    riskLevel: "medium" as IncidentSeverity,
    containmentActions: "",
    vendorReferenceId: "",
    notes: "",
  });

  // Breach update state
  const [breachUpdateForm, setBreachUpdateForm] = useState({
    remediationStatus: "pending" as RemediationStatus,
    notes: "",
  });

  // --- Fetch Incidents ---
  const fetchIncidents = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        status: statusFilter,
        stats: "true",
      });
      if (severityFilter !== "all") {
        params.set("severity", severityFilter);
      }

      const res = await fetch(`/api/admin/incidents?${params}`);
      if (!res.ok) throw new Error("Failed to fetch incidents");

      const data = await res.json();
      setIncidents(data.incidents || []);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Fetch incidents error:", err);
      setError("Failed to load incidents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [statusFilter, severityFilter]);

  // --- Fetch Vendor Breaches ---
  const fetchVendorBreaches = async () => {
    setBreachLoading(true);
    try {
      const res = await fetch("/api/admin/vendor-breaches");
      if (!res.ok) throw new Error("Failed to fetch vendor breaches");
      const data = await res.json();
      setVendorBreaches(data.breaches || []);
    } catch (err) {
      console.error("Fetch vendor breaches error:", err);
    } finally {
      setBreachLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "vendor-breaches") {
      fetchVendorBreaches();
    }
  }, [activeTab]);

  // --- Create Vendor Breach ---
  const handleCreateBreach = async () => {
    setActionLoading(true);
    try {
      const payload = {
        vendorName: breachForm.vendorName,
        customVendorName: breachForm.customVendorName || undefined,
        breachDescription: breachForm.breachDescription,
        affectedDataTypes: breachForm.affectedDataTypes,
        breachOccurredAt: breachForm.breachOccurredAt || undefined,
        affectedUserCount: breachForm.affectedUserCount ? parseInt(breachForm.affectedUserCount) : undefined,
        riskLevel: breachForm.riskLevel,
        containmentActions: breachForm.containmentActions
          ? breachForm.containmentActions.split("\n").filter(Boolean)
          : undefined,
        vendorReferenceId: breachForm.vendorReferenceId || undefined,
        notes: breachForm.notes || undefined,
      };

      const res = await csrfFetch("/api/admin/vendor-breaches", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create breach");
      }

      alert("Vendor breach logged successfully");
      setShowBreachForm(false);
      resetBreachForm();
      fetchVendorBreaches();
    } catch (err) {
      console.error("Create breach error:", err);
      alert(err instanceof Error ? err.message : "Failed to create breach");
    } finally {
      setActionLoading(false);
    }
  };

  // --- Update Vendor Breach ---
  const handleUpdateBreach = async () => {
    if (!selectedBreach) return;
    setActionLoading(true);
    try {
      const res = await csrfFetch(`/api/admin/vendor-breaches/${selectedBreach.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({
          remediationStatus: breachUpdateForm.remediationStatus,
          notes: breachUpdateForm.notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update breach");
      }

      alert("Breach updated successfully");
      setShowBreachModal(false);
      fetchVendorBreaches();
    } catch (err) {
      console.error("Update breach error:", err);
      alert(err instanceof Error ? err.message : "Failed to update breach");
    } finally {
      setActionLoading(false);
    }
  };

  // --- Mark DPB Notified ---
  const handleMarkDpbNotified = async () => {
    if (!selectedBreach) return;
    setActionLoading(true);
    try {
      const res = await csrfFetch(`/api/admin/vendor-breaches/${selectedBreach.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({
          weNotifiedDpbAt: new Date().toISOString(),
          remediationStatus: "in_progress",
        }),
      });

      if (!res.ok) throw new Error("Failed to mark DPB notified");

      alert("Marked as DPB notified");
      setShowBreachModal(false);
      fetchVendorBreaches();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setActionLoading(false);
    }
  };

  // --- Mark Users Notified ---
  const handleMarkUsersNotified = async () => {
    if (!selectedBreach) return;
    setActionLoading(true);
    try {
      const res = await csrfFetch(`/api/admin/vendor-breaches/${selectedBreach.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({
          usersNotifiedAt: new Date().toISOString(),
        }),
      });

      if (!res.ok) throw new Error("Failed to mark users notified");

      alert("Marked as users notified");
      setShowBreachModal(false);
      fetchVendorBreaches();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setActionLoading(false);
    }
  };

  const resetBreachForm = () => {
    setBreachForm({
      vendorName: "razorpay",
      customVendorName: "",
      breachDescription: "",
      affectedDataTypes: [],
      breachOccurredAt: "",
      affectedUserCount: "",
      riskLevel: "medium",
      containmentActions: "",
      vendorReferenceId: "",
      notes: "",
    });
  };

  const openBreachModal = (breach: VendorBreach) => {
    setSelectedBreach(breach);
    setBreachUpdateForm({
      remediationStatus: breach.remediation_status,
      notes: breach.notes || "",
    });
    setShowBreachModal(true);
  };

  // --- Computed Values ---
  const totalOpen = useMemo(() => {
    return stats.critical + stats.high + stats.medium + stats.low;
  }, [stats]);

  // --- Actions ---
  const openModal = (incident: Incident) => {
    setSelectedIncident(incident);
    setNewStatus(incident.status);
    setNotes(incident.notes || "");
    setShowModal(true);
  };

  const closeModal = () => {
    setSelectedIncident(null);
    setShowModal(false);
    setNewStatus("open");
    setNotes("");
  };

  const handleUpdateIncident = async () => {
    if (!selectedIncident) return;

    setActionLoading(true);
    try {
      const res = await csrfFetch(`/api/admin/incidents/${selectedIncident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ status: newStatus, notes }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update incident");
      }

      alert("Incident updated successfully");
      closeModal();
      fetchIncidents();
    } catch (err) {
      console.error("Update incident error:", err);
      alert(err instanceof Error ? err.message : "Failed to update incident");
    } finally {
      setActionLoading(false);
    }
  };

  // --- Render ---
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const renderIncidentCard = (incident: Incident) => {
    const severityConfig = SEVERITY_CONFIG[incident.severity];
    const statusConfig = STATUS_CONFIG[incident.status];

    return (
      <div
        key={incident.id}
        className={`bg-white border-l-4 ${severityConfig.borderColor} rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden`}
      >
        {/* Header */}
        <div className="p-4 pb-2 flex justify-between items-start">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${severityConfig.bgColor} ${severityConfig.color}`}>
            {severityConfig.label}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs ${statusConfig.bgColor} ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>

        {/* Content */}
        <div className="px-4 pb-4 space-y-2">
          <h3 className="font-semibold text-gray-900">
            {INCIDENT_TYPE_LABELS[incident.incident_type] || incident.incident_type}
          </h3>
          <p className="text-sm text-gray-600 line-clamp-2">{incident.description}</p>

          <div className="text-xs text-gray-500 space-y-1">
            <p>Created: {formatDate(incident.created_at)}</p>
            {incident.source_ip && <p className="font-mono">IP: {incident.source_ip}</p>}
            {incident.endpoint && <p className="font-mono truncate">Endpoint: {incident.endpoint}</p>}
            {incident.order_id && (
              <Link href={`/seller/orders/${incident.order_id}`} className="text-blue-600 hover:underline">
                Order: {incident.order_id.slice(0, 8)}...
              </Link>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={() => openModal(incident)}
            className="w-full px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium"
          >
            View Details
          </button>
        </div>
      </div>
    );
  };

  // --- Render Vendor Breach Card ---
  const renderBreachCard = (breach: VendorBreach) => {
    const severityConfig = SEVERITY_CONFIG[breach.risk_level];
    const statusConfig = REMEDIATION_STATUS_CONFIG[breach.remediation_status];

    return (
      <div
        key={breach.id}
        className={`bg-white border-l-4 ${severityConfig.borderColor} rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden`}
      >
        <div className="p-4 pb-2 flex justify-between items-start">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${severityConfig.bgColor} ${severityConfig.color}`}>
            {severityConfig.label}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs ${statusConfig.bgColor} ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>

        <div className="px-4 pb-4 space-y-2">
          <h3 className="font-semibold text-gray-900 capitalize">{breach.vendor_name}</h3>
          <p className="text-sm text-gray-600 line-clamp-2">{breach.breach_description}</p>

          <div className="text-xs text-gray-500 space-y-1">
            <p>Reported: {formatDate(breach.vendor_notified_us_at)}</p>
            <p>Data Types: {breach.affected_data_types.join(", ")}</p>
            {breach.affected_user_count && <p>Affected Users: {breach.affected_user_count}</p>}
          </div>

          {/* Timeline indicators */}
          <div className="flex gap-2 mt-2">
            <span className={`px-2 py-0.5 rounded text-xs ${breach.we_notified_dpb_at ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              DPB {breach.we_notified_dpb_at ? "Notified" : "Pending"}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs ${breach.users_notified_at ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              Users {breach.users_notified_at ? "Notified" : "Pending"}
            </span>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={() => openBreachModal(breach)}
            className="w-full px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium"
          >
            Manage Breach
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Security Dashboard</h1>
            <p className="text-gray-600 mt-1">Monitor and manage security incidents</p>
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("incidents")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "incidents"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Security Incidents
            {totalOpen > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-600">
                {totalOpen}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("vendor-breaches")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "vendor-breaches"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Vendor Breaches
            {vendorBreaches.filter(b => b.remediation_status !== "completed").length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-600">
                {vendorBreaches.filter(b => b.remediation_status !== "completed").length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "incidents" && (
        <>
          {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {(["critical", "high", "medium", "low"] as IncidentSeverity[]).map((severity) => {
          const config = SEVERITY_CONFIG[severity];
          return (
            <div
              key={severity}
              className={`p-4 rounded-lg border ${config.borderColor} ${config.bgColor}`}
            >
              <p className={`text-2xl font-bold ${config.color}`}>{stats[severity]}</p>
              <p className="text-sm text-gray-600">{config.label} Open</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-4 items-center bg-gray-50 p-4 rounded-lg">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as IncidentStatus | "all")}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="false_positive">False Positive</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Severity:</label>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as IncidentSeverity | "all")}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <p className="text-sm text-gray-500 ml-auto">
          {totalOpen} open incident{totalOpen !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">Loading incidents...</span>
        </div>
      ) : incidents.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500 text-lg">No incidents found</p>
          <p className="text-gray-400 text-sm mt-1">
            {statusFilter === "open" ? "No open security incidents. System is secure." : "Try adjusting your filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {incidents.map(renderIncidentCard)}
        </div>
      )}

      {/* Detail Modal */}
      {showModal && selectedIncident && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className={`p-4 border-b ${SEVERITY_CONFIG[selectedIncident.severity].bgColor}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {INCIDENT_TYPE_LABELS[selectedIncident.incident_type] || selectedIncident.incident_type}
                  </h2>
                  <p className="text-sm text-gray-600">ID: {selectedIncident.id}</p>
                </div>
                <button
                  onClick={closeModal}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              {/* Description */}
              <div>
                <h3 className="font-medium text-gray-900 mb-1">Description</h3>
                <p className="text-gray-700">{selectedIncident.description}</p>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Severity</p>
                  <p className={`font-medium ${SEVERITY_CONFIG[selectedIncident.severity].color}`}>
                    {SEVERITY_CONFIG[selectedIncident.severity].label}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Current Status</p>
                  <p className={`font-medium ${STATUS_CONFIG[selectedIncident.status].color}`}>
                    {STATUS_CONFIG[selectedIncident.status].label}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Created</p>
                  <p className="font-medium">{formatDate(selectedIncident.created_at)}</p>
                </div>
                {selectedIncident.resolved_at && (
                  <div>
                    <p className="text-gray-500">Resolved</p>
                    <p className="font-medium">{formatDate(selectedIncident.resolved_at)}</p>
                  </div>
                )}
                {selectedIncident.source_ip && (
                  <div>
                    <p className="text-gray-500">Source IP</p>
                    <p className="font-mono">{selectedIncident.source_ip}</p>
                  </div>
                )}
                {selectedIncident.endpoint && (
                  <div className="col-span-2">
                    <p className="text-gray-500">Endpoint</p>
                    <p className="font-mono text-sm break-all">{selectedIncident.endpoint}</p>
                  </div>
                )}
                {selectedIncident.guest_email && (
                  <div>
                    <p className="text-gray-500">Guest Email</p>
                    <p className="font-medium">{selectedIncident.guest_email}</p>
                  </div>
                )}
                {selectedIncident.order_id && (
                  <div>
                    <p className="text-gray-500">Order ID</p>
                    <Link href={`/seller/orders/${selectedIncident.order_id}`} className="text-blue-600 hover:underline">
                      {selectedIncident.order_id.slice(0, 8)}...
                    </Link>
                  </div>
                )}
              </div>

              {/* Raw Details */}
              {selectedIncident.details && Object.keys(selectedIncident.details).length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Technical Details</h3>
                  <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
                    {JSON.stringify(selectedIncident.details, null, 2)}
                  </pre>
                </div>
              )}

              {/* Update Form */}
              <div className="border-t pt-4">
                <h3 className="font-medium text-gray-900 mb-3">Update Incident</h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value as IncidentStatus)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="open">Open</option>
                      <option value="investigating">Investigating</option>
                      <option value="resolved">Resolved</option>
                      <option value="false_positive">False Positive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Add investigation notes..."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateIncident}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
              >
                {actionLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* Vendor Breaches Tab Content */}
      {activeTab === "vendor-breaches" && (
        <>
          {/* Header with Add Button */}
          <div className="mb-6 flex justify-between items-center">
            <div>
              <p className="text-gray-600">
                Log and track data breaches reported by third-party vendors (Razorpay, Shiprocket, Supabase).
              </p>
              <p className="text-sm text-gray-500 mt-1">
                DPDP Act requires zero-threshold reporting to the Data Protection Board.
              </p>
            </div>
            <button
              onClick={() => setShowBreachForm(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
            >
              + Log Vendor Breach
            </button>
          </div>

          {/* Breach List */}
          {breachLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2">Loading vendor breaches...</span>
            </div>
          ) : vendorBreaches.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-500 text-lg">No vendor breaches logged</p>
              <p className="text-gray-400 text-sm mt-1">
                When a vendor notifies you of a data breach, log it here to track compliance.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {vendorBreaches.map(renderBreachCard)}
            </div>
          )}
        </>
      )}

      {/* Vendor Breach Form Modal */}
      {showBreachForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b bg-red-50">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Log Vendor Breach</h2>
                <button
                  onClick={() => { setShowBreachForm(false); resetBreachForm(); }}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Vendor Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
                <select
                  value={breachForm.vendorName}
                  onChange={(e) => setBreachForm({ ...breachForm, vendorName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                >
                  {VENDOR_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {breachForm.vendorName === "other" && (
                  <input
                    type="text"
                    value={breachForm.customVendorName}
                    onChange={(e) => setBreachForm({ ...breachForm, customVendorName: e.target.value })}
                    placeholder="Enter vendor name"
                    className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                  />
                )}
              </div>

              {/* Breach Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Breach Description *</label>
                <textarea
                  value={breachForm.breachDescription}
                  onChange={(e) => setBreachForm({ ...breachForm, breachDescription: e.target.value })}
                  rows={3}
                  placeholder="Describe the breach as reported by the vendor..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                />
              </div>

              {/* Affected Data Types */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Affected Data Types *</label>
                <div className="grid grid-cols-2 gap-2">
                  {DATA_TYPE_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={breachForm.affectedDataTypes.includes(opt.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setBreachForm({
                              ...breachForm,
                              affectedDataTypes: [...breachForm.affectedDataTypes, opt.value]
                            });
                          } else {
                            setBreachForm({
                              ...breachForm,
                              affectedDataTypes: breachForm.affectedDataTypes.filter(t => t !== opt.value)
                            });
                          }
                        }}
                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Risk Level & Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level *</label>
                  <select
                    value={breachForm.riskLevel}
                    onChange={(e) => setBreachForm({ ...breachForm, riskLevel: e.target.value as IncidentSeverity })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Breach Occurred At</label>
                  <input
                    type="datetime-local"
                    value={breachForm.breachOccurredAt}
                    onChange={(e) => setBreachForm({ ...breachForm, breachOccurredAt: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              </div>

              {/* Affected Users & Vendor Ref */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Affected User Count</label>
                  <input
                    type="number"
                    value={breachForm.affectedUserCount}
                    onChange={(e) => setBreachForm({ ...breachForm, affectedUserCount: e.target.value })}
                    placeholder="Estimated number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Reference ID</label>
                  <input
                    type="text"
                    value={breachForm.vendorReferenceId}
                    onChange={(e) => setBreachForm({ ...breachForm, vendorReferenceId: e.target.value })}
                    placeholder="Ticket/case number from vendor"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              </div>

              {/* Containment Actions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Containment Actions Taken</label>
                <textarea
                  value={breachForm.containmentActions}
                  onChange={(e) => setBreachForm({ ...breachForm, containmentActions: e.target.value })}
                  rows={2}
                  placeholder="One action per line..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={breachForm.notes}
                  onChange={(e) => setBreachForm({ ...breachForm, notes: e.target.value })}
                  rows={2}
                  placeholder="Additional notes..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
              <button
                onClick={() => { setShowBreachForm(false); resetBreachForm(); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBreach}
                disabled={actionLoading || !breachForm.breachDescription || breachForm.affectedDataTypes.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
              >
                {actionLoading ? "Saving..." : "Log Breach"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Breach Detail Modal */}
      {showBreachModal && selectedBreach && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className={`p-4 border-b ${SEVERITY_CONFIG[selectedBreach.risk_level].bgColor}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 capitalize">
                    {selectedBreach.vendor_name} Breach
                  </h2>
                  <p className="text-sm text-gray-600">ID: {selectedBreach.id}</p>
                </div>
                <button
                  onClick={() => setShowBreachModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Description */}
              <div>
                <h3 className="font-medium text-gray-900 mb-1">Breach Description</h3>
                <p className="text-gray-700">{selectedBreach.breach_description}</p>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Risk Level</p>
                  <p className={`font-medium ${SEVERITY_CONFIG[selectedBreach.risk_level].color}`}>
                    {SEVERITY_CONFIG[selectedBreach.risk_level].label}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <p className={`font-medium ${REMEDIATION_STATUS_CONFIG[selectedBreach.remediation_status].color}`}>
                    {REMEDIATION_STATUS_CONFIG[selectedBreach.remediation_status].label}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Vendor Notified Us</p>
                  <p className="font-medium">{formatDate(selectedBreach.vendor_notified_us_at)}</p>
                </div>
                {selectedBreach.breach_occurred_at && (
                  <div>
                    <p className="text-gray-500">Breach Occurred</p>
                    <p className="font-medium">{formatDate(selectedBreach.breach_occurred_at)}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-500">Affected Data Types</p>
                  <p className="font-medium">{selectedBreach.affected_data_types.join(", ")}</p>
                </div>
                {selectedBreach.affected_user_count && (
                  <div>
                    <p className="text-gray-500">Affected Users</p>
                    <p className="font-medium">{selectedBreach.affected_user_count}</p>
                  </div>
                )}
              </div>

              {/* Notification Timeline */}
              <div className="border-t pt-4">
                <h3 className="font-medium text-gray-900 mb-3">Notification Timeline</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${selectedBreach.we_notified_dpb_at ? "bg-green-500" : "bg-gray-300"}`}></span>
                    <span className="text-sm">
                      DPB Notification: {selectedBreach.we_notified_dpb_at ? formatDate(selectedBreach.we_notified_dpb_at) : "Pending"}
                    </span>
                    {!selectedBreach.we_notified_dpb_at && (
                      <button
                        onClick={handleMarkDpbNotified}
                        disabled={actionLoading}
                        className="ml-auto px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        Mark Notified
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${selectedBreach.users_notified_at ? "bg-green-500" : "bg-gray-300"}`}></span>
                    <span className="text-sm">
                      User Notification: {selectedBreach.users_notified_at ? formatDate(selectedBreach.users_notified_at) : "Pending"}
                    </span>
                    {!selectedBreach.users_notified_at && (
                      <button
                        onClick={handleMarkUsersNotified}
                        disabled={actionLoading}
                        className="ml-auto px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        Mark Notified
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Containment Actions */}
              {selectedBreach.containment_actions && selectedBreach.containment_actions.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Containment Actions</h3>
                  <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                    {selectedBreach.containment_actions.map((action, i) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Update Form */}
              <div className="border-t pt-4">
                <h3 className="font-medium text-gray-900 mb-3">Update Status</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Remediation Status</label>
                    <select
                      value={breachUpdateForm.remediationStatus}
                      onChange={(e) => setBreachUpdateForm({ ...breachUpdateForm, remediationStatus: e.target.value as RemediationStatus })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={breachUpdateForm.notes}
                      onChange={(e) => setBreachUpdateForm({ ...breachUpdateForm, notes: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Add notes..."
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
              <button
                onClick={() => setShowBreachModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateBreach}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
              >
                {actionLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
