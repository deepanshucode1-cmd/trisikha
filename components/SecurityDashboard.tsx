"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useCsrf } from "@/hooks/useCsrf";
import DeletionRequestsTab from "./DeletionRequestsTab";
import CorrectionRequestsTab from "./CorrectionRequestsTab";
import AffectedUsersSection from "./AffectedUsersSection";

// --- Types ---
type IncidentSeverity = "low" | "medium" | "high" | "critical";
type IncidentStatus = "open" | "investigating" | "resolved" | "false_positive";
type RemediationStatus = "pending" | "in_progress" | "completed";
type TabType = "incidents" | "vendor-breaches" | "deletion-requests" | "corrections" | "compliance" | "ip-blocking";

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

type BlockedIp = {
  id: string;
  ip_address: string;
  block_type: "temporary" | "permanent";
  reason: string;
  offense_count: number;
  blocked_at: string;
  blocked_until?: string;
  incident_type?: string;
  is_active: boolean;
};

type WhitelistEntry = {
  id: string;
  ip_address: string;
  cidr_range?: string;
  label: string;
  category: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
};

type IpHistoryEntry = {
  id: string;
  ip_address: string;
  incident_type: string;
  severity?: string;
  endpoint?: string;
  created_at: string;
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
  is_personal_data_breach?: boolean | null;
  dpb_breach_type?: string | null;
  dpb_notified_at?: string | null;
  dpb_report_generated_at?: string | null;
};

type DpbBreachType = "confidentiality" | "integrity" | "availability";

type DpbReportForm = {
  affectedDataPrincipals: string;
  dataCategories: string;
  breachDescription: string;
  containmentMeasures: string;
  riskMitigation: string;
  likelyConsequences: string;
  transferToThirdParty: boolean;
  crossBorderTransfer: boolean;
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

  // DPB classification state
  const [dpbBreachType, setDpbBreachType] = useState<DpbBreachType>("confidentiality");
  const [showDpbReportForm, setShowDpbReportForm] = useState(false);
  const [dpbReportForm, setDpbReportForm] = useState<DpbReportForm>({
    affectedDataPrincipals: "",
    dataCategories: "",
    breachDescription: "",
    containmentMeasures: "",
    riskMitigation: "",
    likelyConsequences: "",
    transferToThirdParty: false,
    crossBorderTransfer: false,
  });

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

  // IP Blocking state
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [ipBlockingLoading, setIpBlockingLoading] = useState(false);
  const [showBlockIpForm, setShowBlockIpForm] = useState(false);
  const [showWhitelistForm, setShowWhitelistForm] = useState(false);
  const [selectedIpHistory, setSelectedIpHistory] = useState<IpHistoryEntry[] | null>(null);
  const [selectedIpAddress, setSelectedIpAddress] = useState<string | null>(null);
  const [showIpHistoryModal, setShowIpHistoryModal] = useState(false);
  const [ipHistoryLoading, setIpHistoryLoading] = useState(false);

  // Block IP form state
  const [blockIpForm, setBlockIpForm] = useState({
    ip: "",
    blockType: "temporary" as "temporary" | "permanent",
    reason: "",
    durationMinutes: 60,
  });

  // Whitelist form state
  const [whitelistForm, setWhitelistForm] = useState({
    ip: "",
    cidrRange: "",
    label: "",
    category: "internal" as "payment_gateway" | "webhook_provider" | "internal" | "monitoring" | "admin",
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
    if (activeTab === "ip-blocking") {
      fetchBlockedIps();
      fetchWhitelist();
    }
  }, [activeTab]);

  // --- Fetch Blocked IPs ---
  const fetchBlockedIps = async () => {
    setIpBlockingLoading(true);
    try {
      const res = await fetch("/api/admin/ip-blocking?active=true");
      if (!res.ok) throw new Error("Failed to fetch blocked IPs");
      const data = await res.json();
      setBlockedIps(data.blocks || []);
    } catch (err) {
      console.error("Fetch blocked IPs error:", err);
    } finally {
      setIpBlockingLoading(false);
    }
  };

  // --- Fetch Whitelist ---
  const fetchWhitelist = async () => {
    try {
      const res = await fetch("/api/admin/ip-whitelist");
      if (!res.ok) throw new Error("Failed to fetch whitelist");
      const data = await res.json();
      setWhitelist(data.whitelist || []);
    } catch (err) {
      console.error("Fetch whitelist error:", err);
    }
  };

  // --- Fetch IP History ---
  const fetchIpHistory = async (ip: string) => {
    setIpHistoryLoading(true);
    setSelectedIpAddress(ip);
    try {
      const res = await fetch(`/api/admin/ip-blocking/${encodeURIComponent(ip)}`);
      if (!res.ok) throw new Error("Failed to fetch IP history");
      const data = await res.json();
      setSelectedIpHistory(data.history || []);
      setShowIpHistoryModal(true);
    } catch (err) {
      console.error("Fetch IP history error:", err);
      alert("Failed to fetch IP history");
    } finally {
      setIpHistoryLoading(false);
    }
  };

  // --- Block IP ---
  const handleBlockIp = async () => {
    setActionLoading(true);
    try {
      const res = await csrfFetch("/api/admin/ip-blocking", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify(blockIpForm),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to block IP");
      }

      alert("IP blocked successfully");
      setShowBlockIpForm(false);
      setBlockIpForm({ ip: "", blockType: "temporary", reason: "", durationMinutes: 60 });
      fetchBlockedIps();
    } catch (err) {
      console.error("Block IP error:", err);
      alert(err instanceof Error ? err.message : "Failed to block IP");
    } finally {
      setActionLoading(false);
    }
  };

  // --- Unblock IP ---
  const handleUnblockIp = async (ip: string) => {
    if (!confirm(`Are you sure you want to unblock ${ip}?`)) return;
    setActionLoading(true);
    try {
      const res = await csrfFetch(`/api/admin/ip-blocking?ip=${encodeURIComponent(ip)}`, {
        method: "DELETE",
        headers: getCsrfHeaders(),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to unblock IP");
      }

      alert("IP unblocked successfully");
      fetchBlockedIps();
    } catch (err) {
      console.error("Unblock IP error:", err);
      alert(err instanceof Error ? err.message : "Failed to unblock IP");
    } finally {
      setActionLoading(false);
    }
  };

  // --- Add to Whitelist ---
  const handleAddWhitelist = async () => {
    setActionLoading(true);
    try {
      const res = await csrfFetch("/api/admin/ip-whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify(whitelistForm),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add to whitelist");
      }

      alert("IP added to whitelist");
      setShowWhitelistForm(false);
      setWhitelistForm({ ip: "", cidrRange: "", label: "", category: "internal", notes: "" });
      fetchWhitelist();
    } catch (err) {
      console.error("Add whitelist error:", err);
      alert(err instanceof Error ? err.message : "Failed to add to whitelist");
    } finally {
      setActionLoading(false);
    }
  };

  // --- Remove from Whitelist ---
  const handleRemoveWhitelist = async (ip: string) => {
    if (!confirm(`Remove ${ip} from whitelist?`)) return;
    setActionLoading(true);
    try {
      const res = await csrfFetch(`/api/admin/ip-whitelist?ip=${encodeURIComponent(ip)}`, {
        method: "DELETE",
        headers: getCsrfHeaders(),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove from whitelist");
      }

      alert("IP removed from whitelist");
      fetchWhitelist();
    } catch (err) {
      console.error("Remove whitelist error:", err);
      alert(err instanceof Error ? err.message : "Failed to remove from whitelist");
    } finally {
      setActionLoading(false);
    }
  };

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
    setDpbBreachType((incident.dpb_breach_type as DpbBreachType) || "confidentiality");
    setShowDpbReportForm(false);
    setDpbReportForm({
      affectedDataPrincipals: "",
      dataCategories: "",
      breachDescription: "",
      containmentMeasures: "",
      riskMitigation: "",
      likelyConsequences: "",
      transferToThirdParty: false,
      crossBorderTransfer: false,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setSelectedIncident(null);
    setShowModal(false);
    setNewStatus("open");
    setNotes("");
    setShowDpbReportForm(false);
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

  const handleClassifyBreach = async (isBreach: boolean) => {
    if (!selectedIncident) return;
    setActionLoading(true);
    try {
      const res = await csrfFetch(`/api/admin/incidents/${selectedIncident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ isPersonalDataBreach: isBreach }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to classify incident");
      }
      setSelectedIncident({ ...selectedIncident, is_personal_data_breach: isBreach });
      fetchIncidents();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to classify incident");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateBreachType = async (type: DpbBreachType) => {
    if (!selectedIncident) return;
    setDpbBreachType(type);
    setActionLoading(true);
    try {
      const res = await csrfFetch(`/api/admin/incidents/${selectedIncident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ dpbBreachType: type }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update breach type");
      }
      setSelectedIncident({ ...selectedIncident, dpb_breach_type: type });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update breach type");
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateDpbReport = async () => {
    if (!selectedIncident) return;
    const count = parseInt(dpbReportForm.affectedDataPrincipals);
    if (isNaN(count) || count < 0) {
      alert("Please enter a valid number of affected data principals");
      return;
    }
    if (!dpbReportForm.breachDescription.trim()) {
      alert("Please provide a breach description");
      return;
    }
    setActionLoading(true);
    try {
      const res = await csrfFetch(`/api/admin/incidents/${selectedIncident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({
          generateDpbReportData: {
            affectedDataPrincipals: count,
            dataCategories: dpbReportForm.dataCategories.split(",").map((s: string) => s.trim()).filter(Boolean),
            breachDescription: dpbReportForm.breachDescription,
            containmentMeasures: dpbReportForm.containmentMeasures.split(",").map((s: string) => s.trim()).filter(Boolean),
            riskMitigation: dpbReportForm.riskMitigation.split(",").map((s: string) => s.trim()).filter(Boolean),
            likelyConsequences: dpbReportForm.likelyConsequences || undefined,
            transferToThirdParty: dpbReportForm.transferToThirdParty,
            crossBorderTransfer: dpbReportForm.crossBorderTransfer,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate DPB report");
      }
      alert("DPB breach report generated and sent successfully");
      setSelectedIncident({
        ...selectedIncident,
        dpb_report_generated_at: new Date().toISOString(),
      });
      setShowDpbReportForm(false);
      fetchIncidents();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate DPB report");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkIncidentDpbNotified = async () => {
    if (!selectedIncident) return;
    setActionLoading(true);
    try {
      const now = new Date().toISOString();
      const res = await csrfFetch(`/api/admin/incidents/${selectedIncident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ dpbNotifiedAt: now }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to mark DPB notified");
      }
      setSelectedIncident({ ...selectedIncident, dpb_notified_at: now });
      fetchIncidents();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to mark DPB notified");
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
          <div className="flex gap-2 items-center">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${severityConfig.bgColor} ${severityConfig.color}`}>
              {severityConfig.label}
            </span>
            {incident.is_personal_data_breach === true && (
              <span className={`px-2 py-0.5 rounded text-xs ${incident.dpb_notified_at ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                DPB {incident.dpb_notified_at ? "Notified" : "Pending"}
              </span>
            )}
          </div>
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
          <button
            onClick={() => setActiveTab("deletion-requests")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "deletion-requests"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Deletion Requests
          </button>
          <button
            onClick={() => setActiveTab("corrections")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "corrections"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Corrections
          </button>
          <button
            onClick={() => setActiveTab("compliance")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "compliance"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            DPDP Compliance
          </button>
          <button
            onClick={() => setActiveTab("ip-blocking")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "ip-blocking"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            IP Blocking
            {blockedIps.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-600">
                {blockedIps.length}
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

              {/* Affected Users Section */}
              {(selectedIncident.incident_type.includes("vendor") ||
                selectedIncident.incident_type.includes("breach") ||
                selectedIncident.incident_type === "bulk_data_export" ||
                selectedIncident.severity === "critical" ||
                selectedIncident.severity === "high") && (
                <div className="border-t pt-4">
                  <AffectedUsersSection
                    incidentId={selectedIncident.id}
                    incidentType={selectedIncident.incident_type}
                  />
                </div>
              )}

              {/* DPB Breach Classification */}
              <div className="border-t pt-4">
                <h3 className="font-medium text-gray-900 mb-3">DPB Breach Classification</h3>

                {/* State: Not yet classified */}
                {selectedIncident.is_personal_data_breach == null && (
                  <div className="space-y-3">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                      <p className="text-sm font-medium text-yellow-800">Investigation Required</p>
                      <p className="text-xs text-yellow-700 mt-1">
                        Review the incident details and determine whether personal data was breached. Under DPDP Act 2023, all personal data breaches require zero-threshold reporting to the Data Protection Board.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleClassifyBreach(true)}
                        disabled={actionLoading}
                        className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
                      >
                        Yes, Personal Data Breach
                      </button>
                      <button
                        onClick={() => handleClassifyBreach(false)}
                        disabled={actionLoading}
                        className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
                      >
                        Not a Data Breach
                      </button>
                    </div>
                  </div>
                )}

                {/* State: Classified as NOT a breach */}
                {selectedIncident.is_personal_data_breach === false && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3 flex justify-between items-center">
                    <p className="text-sm text-green-800">Classified as <strong>not a personal data breach</strong>.</p>
                    <button
                      onClick={() => handleClassifyBreach(true)}
                      disabled={actionLoading}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Reclassify
                    </button>
                  </div>
                )}

                {/* State: Classified as breach */}
                {selectedIncident.is_personal_data_breach === true && (
                  <div className="space-y-4">
                    {/* Breach Type Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Breach Type (CIA Triad)</label>
                      <select
                        value={dpbBreachType}
                        onChange={(e) => handleUpdateBreachType(e.target.value as DpbBreachType)}
                        disabled={actionLoading}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="confidentiality">Confidentiality (Unauthorized access/disclosure)</option>
                        <option value="integrity">Integrity (Unauthorized modification/deletion)</option>
                        <option value="availability">Availability (Loss of access to data)</option>
                      </select>
                    </div>

                    {/* DPB Notification Timeline */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">DPB Notification Timeline</h4>
                      <div className="space-y-2">
                        {/* Step 1: Report Generated */}
                        <div className="flex items-center gap-3">
                          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${selectedIncident.dpb_report_generated_at ? "bg-green-500" : "bg-gray-300"}`}></span>
                          <span className="text-sm text-gray-700">
                            Report Generated: {selectedIncident.dpb_report_generated_at ? formatDate(selectedIncident.dpb_report_generated_at) : "Pending"}
                          </span>
                          {!selectedIncident.dpb_report_generated_at && (
                            <button
                              onClick={() => setShowDpbReportForm(!showDpbReportForm)}
                              className="ml-auto px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              {showDpbReportForm ? "Cancel" : "Generate Report"}
                            </button>
                          )}
                        </div>
                        {/* Step 2: DPB Notified */}
                        <div className="flex items-center gap-3">
                          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${selectedIncident.dpb_notified_at ? "bg-green-500" : "bg-gray-300"}`}></span>
                          <span className="text-sm text-gray-700">
                            DPB Notified: {selectedIncident.dpb_notified_at ? formatDate(selectedIncident.dpb_notified_at) : "Pending"}
                          </span>
                          {selectedIncident.dpb_report_generated_at && !selectedIncident.dpb_notified_at && (
                            <button
                              onClick={handleMarkIncidentDpbNotified}
                              disabled={actionLoading}
                              className="ml-auto px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              Mark Notified
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Report Generation Form (expandable) */}
                    {showDpbReportForm && (
                      <div className="bg-gray-50 border border-gray-200 rounded-md p-4 space-y-3">
                        <h4 className="text-sm font-medium text-gray-900">DPB Breach Report Details</h4>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Affected Data Principals (count)</label>
                          <input
                            type="number"
                            min="0"
                            value={dpbReportForm.affectedDataPrincipals}
                            onChange={(e) => setDpbReportForm({ ...dpbReportForm, affectedDataPrincipals: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                            placeholder="e.g., 150"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Data Categories (comma-separated)</label>
                          <input
                            type="text"
                            value={dpbReportForm.dataCategories}
                            onChange={(e) => setDpbReportForm({ ...dpbReportForm, dataCategories: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                            placeholder="e.g., name, email, phone, address"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Breach Description</label>
                          <textarea
                            value={dpbReportForm.breachDescription}
                            onChange={(e) => setDpbReportForm({ ...dpbReportForm, breachDescription: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Describe what happened..."
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Containment Measures (comma-separated)</label>
                          <input
                            type="text"
                            value={dpbReportForm.containmentMeasures}
                            onChange={(e) => setDpbReportForm({ ...dpbReportForm, containmentMeasures: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                            placeholder="e.g., IP blocked, access revoked, passwords reset"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Risk Mitigation Measures (comma-separated)</label>
                          <input
                            type="text"
                            value={dpbReportForm.riskMitigation}
                            onChange={(e) => setDpbReportForm({ ...dpbReportForm, riskMitigation: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                            placeholder="e.g., security audit scheduled, monitoring enhanced"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Likely Consequences (optional)</label>
                          <input
                            type="text"
                            value={dpbReportForm.likelyConsequences}
                            onChange={(e) => setDpbReportForm({ ...dpbReportForm, likelyConsequences: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                            placeholder="e.g., potential identity theft risk"
                          />
                        </div>

                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={dpbReportForm.transferToThirdParty}
                              onChange={(e) => setDpbReportForm({ ...dpbReportForm, transferToThirdParty: e.target.checked })}
                              className="rounded border-gray-300"
                            />
                            Third-party transfer involved
                          </label>
                          <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={dpbReportForm.crossBorderTransfer}
                              onChange={(e) => setDpbReportForm({ ...dpbReportForm, crossBorderTransfer: e.target.checked })}
                              className="rounded border-gray-300"
                            />
                            Cross-border transfer involved
                          </label>
                        </div>

                        <button
                          onClick={handleGenerateDpbReport}
                          disabled={actionLoading}
                          className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
                        >
                          {actionLoading ? "Generating..." : "Generate & Send DPB Report"}
                        </button>
                      </div>
                    )}

                    {/* Reclassify link */}
                    <div className="text-right">
                      <button
                        onClick={() => handleClassifyBreach(false)}
                        disabled={actionLoading}
                        className="text-sm text-gray-500 hover:underline"
                      >
                        Reclassify as not a breach
                      </button>
                    </div>
                  </div>
                )}
              </div>

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

      {/* Deletion Requests Tab Content */}
      {activeTab === "deletion-requests" && (
        <DeletionRequestsTab />
      )}

      {/* Correction Requests Tab Content */}
      {activeTab === "corrections" && (
        <CorrectionRequestsTab />
      )}

      {/* Compliance Tab Content */}
      {activeTab === "compliance" && (
        <div className="space-y-6">
          {/* DPDP Compliance Checklist */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">DPDP Act Compliance Checklist</h2>
            <p className="text-gray-600 mb-6">Digital Personal Data Protection Act 2023 requirements</p>

            <div className="space-y-4">
              {/* Implemented Items */}
              <div className="border-l-4 border-green-500 pl-4">
                <h3 className="font-semibold text-green-700 mb-2">Implemented</h3>
                <ul className="space-y-2">
                  {[
                    { item: "Privacy Policy", desc: "Published at /privacy-policy" },
                    { item: "Data Export (Portability)", desc: "API and UI at /my-data" },
                    { item: "Data Deletion (Erasure)", desc: "API and UI at /my-data" },
                    { item: "Cookie Consent", desc: "Banner with granular preferences" },
                    { item: "Audit Logging", desc: "All data access logged" },
                    { item: "Breach Notification System", desc: "Email templates ready" },
                    { item: "Vendor Breach Tracking", desc: "Dashboard for 3rd party breaches" },
                    { item: "Security Incident Monitoring", desc: "CIA triad monitoring" },
                    { item: "Rate Limiting", desc: "Protection against brute force" },
                    { item: "Data Encryption", desc: "TLS/SSL, HTTPS enforced" },
                  ].map((check, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <div>
                        <span className="font-medium text-gray-900">{check.item}</span>
                        <span className="text-gray-500 text-sm ml-2">- {check.desc}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pending Items */}
              <div className="border-l-4 border-yellow-500 pl-4 mt-6">
                <h3 className="font-semibold text-yellow-700 mb-2">Requires Action</h3>
                <ul className="space-y-2">
                  {[
                    { item: "Grievance Officer", desc: "Designate and publish contact details", priority: "high" },
                    { item: "Data Processing Agreements", desc: "Sign DPAs with Supabase, Razorpay, Shiprocket", priority: "high" },
                    { item: "Data Localization Verification", desc: "Confirm Supabase stores data in India", priority: "medium" },
                    { item: "VAPT Report", desc: "Schedule penetration testing", priority: "medium" },
                  ].map((check, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <span className="font-medium text-gray-900">{check.item}</span>
                        <span className={`ml-2 px-2 py-0.5 text-xs rounded ${check.priority === "high" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {check.priority}
                        </span>
                        <p className="text-gray-500 text-sm">{check.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Data Retention Policy */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Data Retention Policy</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Retention Period</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Legal Basis</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deletion</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">Order Data</td>
                    <td className="px-4 py-3 text-sm text-gray-600">7 years</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Income Tax Act</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Anonymization on request</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">Personal Info (Name, Email, Phone, Address)</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Until deletion request</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Consent / Contract</td>
                    <td className="px-4 py-3 text-sm text-gray-600">On request via /my-data</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">Security Incidents</td>
                    <td className="px-4 py-3 text-sm text-gray-600">3 years</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Legitimate Interest</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Automatic</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">Audit Logs</td>
                    <td className="px-4 py-3 text-sm text-gray-600">3 years</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Legal Compliance</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Automatic</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">OTP Codes</td>
                    <td className="px-4 py-3 text-sm text-gray-600">10 minutes</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Security</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Automatic</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">Payment Data</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Handled by Razorpay</td>
                    <td className="px-4 py-3 text-sm text-gray-600">PCI-DSS</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Per Razorpay policy</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Third-Party Vendors */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Third-Party Data Processors</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { name: "Supabase", purpose: "Database & Authentication", dpa: "pending", location: "Verify India region" },
                { name: "Razorpay", purpose: "Payment Processing", dpa: "pending", location: "India" },
                { name: "Shiprocket", purpose: "Logistics & Shipping", dpa: "pending", location: "India" },
              ].map((vendor, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900">{vendor.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{vendor.purpose}</p>
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">DPA Status:</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${vendor.dpa === "signed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {vendor.dpa === "signed" ? "Signed" : "Pending"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">Location:</span>
                      <span className="text-gray-700">{vendor.location}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-4">Quick Links</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link href="/privacy-policy" target="_blank" className="text-blue-700 hover:underline text-sm">
                Privacy Policy
              </Link>
              <Link href="/terms" target="_blank" className="text-blue-700 hover:underline text-sm">
                Terms of Service
              </Link>
              <Link href="/my-data" target="_blank" className="text-blue-700 hover:underline text-sm">
                Data Request Page
              </Link>
              <a href="mailto:trishikhaorganic@gmail.com" className="text-blue-700 hover:underline text-sm">
                Support Email
              </a>
            </div>
          </div>
        </div>
      )}

      {/* IP Blocking Tab Content */}
      {activeTab === "ip-blocking" && (
        <>
          {/* Header with Action Buttons */}
          <div className="mb-6 flex justify-between items-center">
            <div>
              <p className="text-gray-600">
                Manage blocked IPs and trusted IP whitelist for security protection.
              </p>
              <p className="text-sm text-gray-500 mt-1">
                IPs are automatically blocked based on security incidents with exponential backoff.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowWhitelistForm(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
              >
                + Add Whitelist
              </button>
              <button
                onClick={() => setShowBlockIpForm(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
              >
                + Block IP
              </button>
            </div>
          </div>

          {ipBlockingLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2">Loading...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Blocked IPs Section */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-red-50">
                  <h2 className="text-lg font-semibold text-gray-900">Blocked IPs ({blockedIps.length})</h2>
                </div>
                {blockedIps.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-gray-500">No IPs currently blocked</p>
                    <p className="text-gray-400 text-sm mt-1">IPs are automatically blocked when security incidents occur</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Offenses</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Blocked Until</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {blockedIps.map((block) => (
                          <tr key={block.id}>
                            <td className="px-4 py-3 text-sm font-mono text-gray-900">{block.ip_address}</td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                block.block_type === "permanent"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-yellow-100 text-yellow-700"
                              }`}>
                                {block.block_type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={block.reason}>
                              {block.reason}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{block.offense_count}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {block.block_type === "permanent"
                                ? "Never"
                                : block.blocked_until
                                  ? formatDate(block.blocked_until)
                                  : "-"}
                            </td>
                            <td className="px-4 py-3 text-sm space-x-2">
                              <button
                                onClick={() => fetchIpHistory(block.ip_address)}
                                className="text-blue-600 hover:underline"
                              >
                                History
                              </button>
                              <button
                                onClick={() => handleUnblockIp(block.ip_address)}
                                disabled={actionLoading}
                                className="text-red-600 hover:underline disabled:opacity-50"
                              >
                                Unblock
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Whitelist Section */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-green-50">
                  <h2 className="text-lg font-semibold text-gray-900">Whitelisted IPs ({whitelist.length})</h2>
                  <p className="text-sm text-gray-500">These IPs are trusted and will never be blocked</p>
                </div>
                {whitelist.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-gray-500">No whitelisted IPs</p>
                    <p className="text-gray-400 text-sm mt-1">Add payment gateway and webhook provider IPs here</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP/CIDR</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Added</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {whitelist.map((entry) => (
                          <tr key={entry.id}>
                            <td className="px-4 py-3 text-sm font-mono text-gray-900">
                              {entry.ip_address}
                              {entry.cidr_range && <span className="text-gray-500 ml-1">({entry.cidr_range})</span>}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">{entry.label}</td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                {
                                  payment_gateway: "bg-purple-100 text-purple-700",
                                  webhook_provider: "bg-blue-100 text-blue-700",
                                  internal: "bg-gray-100 text-gray-700",
                                  monitoring: "bg-cyan-100 text-cyan-700",
                                  admin: "bg-orange-100 text-orange-700",
                                }[entry.category] || "bg-gray-100 text-gray-700"
                              }`}>
                                {entry.category.replace("_", " ")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{formatDate(entry.created_at)}</td>
                            <td className="px-4 py-3 text-sm">
                              <button
                                onClick={() => handleRemoveWhitelist(entry.ip_address)}
                                disabled={actionLoading}
                                className="text-red-600 hover:underline disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Block Duration Reference */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="font-semibold text-blue-900 mb-3">Exponential Backoff Schedule</h3>
                <p className="text-sm text-blue-700 mb-3">
                  Temporary blocks increase in duration with each offense. After 30 days without incidents, the offense count resets.
                </p>
                <div className="grid grid-cols-5 gap-4 text-center text-sm">
                  {[
                    { offense: "1st", duration: "15 min" },
                    { offense: "2nd", duration: "1 hour" },
                    { offense: "3rd", duration: "6 hours" },
                    { offense: "4th", duration: "24 hours" },
                    { offense: "5th+", duration: "7 days" },
                  ].map((item, i) => (
                    <div key={i} className="bg-white rounded-lg p-3 border border-blue-200">
                      <p className="font-medium text-blue-900">{item.offense}</p>
                      <p className="text-blue-700">{item.duration}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Block IP Modal */}
      {showBlockIpForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b bg-red-50">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Block IP Address</h2>
                <button
                  onClick={() => setShowBlockIpForm(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IP Address *</label>
                <input
                  type="text"
                  value={blockIpForm.ip}
                  onChange={(e) => setBlockIpForm({ ...blockIpForm, ip: e.target.value })}
                  placeholder="e.g., 192.168.1.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Block Type *</label>
                <select
                  value={blockIpForm.blockType}
                  onChange={(e) => setBlockIpForm({ ...blockIpForm, blockType: e.target.value as "temporary" | "permanent" })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                >
                  <option value="temporary">Temporary</option>
                  <option value="permanent">Permanent</option>
                </select>
              </div>
              {blockIpForm.blockType === "temporary" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                  <select
                    value={blockIpForm.durationMinutes}
                    onChange={(e) => setBlockIpForm({ ...blockIpForm, durationMinutes: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                  >
                    <option value={15}>15 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={360}>6 hours</option>
                    <option value={1440}>24 hours</option>
                    <option value={10080}>7 days</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                <textarea
                  value={blockIpForm.reason}
                  onChange={(e) => setBlockIpForm({ ...blockIpForm, reason: e.target.value })}
                  rows={3}
                  placeholder="Reason for blocking this IP..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
              <button
                onClick={() => setShowBlockIpForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleBlockIp}
                disabled={actionLoading || !blockIpForm.ip || !blockIpForm.reason}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
              >
                {actionLoading ? "Blocking..." : "Block IP"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Whitelist Modal */}
      {showWhitelistForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b bg-green-50">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Add to Whitelist</h2>
                <button
                  onClick={() => setShowWhitelistForm(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IP Address *</label>
                <input
                  type="text"
                  value={whitelistForm.ip}
                  onChange={(e) => setWhitelistForm({ ...whitelistForm, ip: e.target.value })}
                  placeholder="e.g., 192.168.1.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CIDR Range (optional)</label>
                <input
                  type="text"
                  value={whitelistForm.cidrRange}
                  onChange={(e) => setWhitelistForm({ ...whitelistForm, cidrRange: e.target.value })}
                  placeholder="e.g., 10.0.0.0/8"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Label *</label>
                <input
                  type="text"
                  value={whitelistForm.label}
                  onChange={(e) => setWhitelistForm({ ...whitelistForm, label: e.target.value })}
                  placeholder="e.g., Razorpay Webhook"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  value={whitelistForm.category}
                  onChange={(e) => setWhitelistForm({ ...whitelistForm, category: e.target.value as typeof whitelistForm.category })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                >
                  <option value="payment_gateway">Payment Gateway</option>
                  <option value="webhook_provider">Webhook Provider</option>
                  <option value="internal">Internal</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={whitelistForm.notes}
                  onChange={(e) => setWhitelistForm({ ...whitelistForm, notes: e.target.value })}
                  rows={2}
                  placeholder="Additional notes..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
              <button
                onClick={() => setShowWhitelistForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleAddWhitelist}
                disabled={actionLoading || !whitelistForm.ip || !whitelistForm.label}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50"
              >
                {actionLoading ? "Adding..." : "Add to Whitelist"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IP History Modal */}
      {showIpHistoryModal && selectedIpAddress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b bg-gray-50">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">IP History</h2>
                  <p className="text-sm font-mono text-gray-600">{selectedIpAddress}</p>
                </div>
                <button
                  onClick={() => { setShowIpHistoryModal(false); setSelectedIpHistory(null); }}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="p-6">
              {ipHistoryLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : selectedIpHistory && selectedIpHistory.length > 0 ? (
                <div className="space-y-3">
                  {selectedIpHistory.map((entry) => (
                    <div key={entry.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900">
                            {INCIDENT_TYPE_LABELS[entry.incident_type] || entry.incident_type}
                          </p>
                          {entry.endpoint && (
                            <p className="text-sm font-mono text-gray-500 truncate">{entry.endpoint}</p>
                          )}
                        </div>
                        {entry.severity && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_CONFIG[entry.severity as IncidentSeverity]?.bgColor} ${SEVERITY_CONFIG[entry.severity as IncidentSeverity]?.color}`}>
                            {entry.severity}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">{formatDate(entry.created_at)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500">No offense history for this IP</p>
              )}
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end rounded-b-lg">
              <button
                onClick={() => { setShowIpHistoryModal(false); setSelectedIpHistory(null); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
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

              {/* Affected Users Section - if linked to an incident */}
              {selectedBreach.internal_incident_id && (
                <div className="border-t pt-4">
                  <AffectedUsersSection
                    incidentId={selectedBreach.internal_incident_id}
                    incidentType={`vendor_breach_${selectedBreach.vendor_name}`}
                  />
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
