"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useCsrf } from "@/hooks/useCsrf";

// Types
type ClaimStatus = "pending" | "verified" | "rejected" | "completed";
type ClaimType = "death" | "incapacity";
type Relationship =
  | "spouse"
  | "child"
  | "parent"
  | "sibling"
  | "legal_guardian"
  | "other";

type Nominee = {
  id: string;
  principal_email: string;
  nominee_name: string;
  nominee_email: string;
  relationship: Relationship;
  created_at: string;
};

type NomineeClaim = {
  id: string;
  nominee_id: string;
  principal_email: string;
  nominee_email: string;
  claim_type: ClaimType;
  document_path: string;
  document_filename: string;
  document_content_type: string;
  action_export: boolean;
  action_deletion: boolean;
  status: ClaimStatus;
  admin_notes: string | null;
  processed_by: string | null;
  processed_at: string | null;
  document_retained_until: string | null;
  ip_address: string | null;
  created_at: string;
  updated_at: string;
  nominee?: Nominee;
};

type ClaimStats = {
  pending: number;
  verified: number;
  rejected: number;
  completed: number;
};

// Status configuration
const STATUS_CONFIG: Record<
  ClaimStatus,
  { label: string; color: string; bgColor: string }
> = {
  pending: { label: "Pending", color: "text-yellow-700", bgColor: "bg-yellow-100" },
  verified: { label: "Verified", color: "text-blue-700", bgColor: "bg-blue-100" },
  rejected: { label: "Rejected", color: "text-red-700", bgColor: "bg-red-100" },
  completed: { label: "Completed", color: "text-green-700", bgColor: "bg-green-100" },
};

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  death: "Death",
  incapacity: "Incapacity",
};

const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  spouse: "Spouse",
  child: "Child",
  parent: "Parent",
  sibling: "Sibling",
  legal_guardian: "Legal Guardian",
  other: "Other",
};

export default function NomineeClaimsClient() {
  const { token: csrfToken } = useCsrf();

  // State
  const [claims, setClaims] = useState<NomineeClaim[]>([]);
  const [stats, setStats] = useState<ClaimStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | "all">("all");
  const [emailSearch, setEmailSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 20;

  // Modal state
  const [selectedClaim, setSelectedClaim] = useState<NomineeClaim | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [docLoading, setDocLoading] = useState(false);

  // Action form state
  const [actionNotes, setActionNotes] = useState("");

  // Fetch claims
  const fetchClaims = useCallback(async () => {
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
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));

      const res = await fetch(`/api/admin/nominee-claims?${params}`);
      if (!res.ok) throw new Error("Failed to fetch nominee claims");

      const data = await res.json();
      setClaims(data.claims || []);
      setTotal(data.total || 0);
      setStats(data.stats || null);
    } catch (err) {
      console.error("Fetch nominee claims error:", err);
      setError("Failed to load nominee claims");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, emailSearch, page]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  // Open detail modal
  const openDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/nominee-claims/${id}`);
      if (!res.ok) throw new Error("Failed to fetch claim details");
      const data = await res.json();
      setSelectedClaim(data.claim as NomineeClaim);
      setActionNotes("");
      setShowModal(true);
    } catch (err) {
      console.error("Fetch claim details error:", err);
    }
  };

  // Process claim
  const handleAction = async (action: "verify" | "reject" | "complete") => {
    if (!selectedClaim || !csrfToken) return;

    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/admin/nominee-claims/${selectedClaim.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({
            action,
            adminNotes: actionNotes || undefined,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to process claim");
      }

      setShowModal(false);
      fetchClaims();
    } catch (err) {
      console.error("Process claim error:", err);
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Download document
  const handleDownloadDocument = async (claimId: string) => {
    setDocLoading(true);
    try {
      const res = await fetch(
        `/api/admin/nominee-claims/${claimId}/document`
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to get document");
      }

      const data = await res.json();
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      console.error("Download document error:", err);
      alert((err as Error).message);
    } finally {
      setDocLoading(false);
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

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Nominee Claims</h1>
          <p className="mt-1 text-sm text-gray-600">
            DPDP Rule 14 — Review and process nominee claims for data export/deletion
          </p>
        </div>

        <div className="space-y-6">
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-yellow-700">
                  {stats.pending}
                </div>
                <div className="text-sm text-yellow-600">Pending</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-700">
                  {stats.verified}
                </div>
                <div className="text-sm text-blue-600">Verified</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-700">
                  {stats.rejected}
                </div>
                <div className="text-sm text-red-600">Rejected</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-700">
                  {stats.completed}
                </div>
                <div className="text-sm text-green-600">Completed</div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as ClaimStatus | "all");
                setPage(0);
              }}
              className="border rounded-lg px-3 py-2"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
              <option value="completed">Completed</option>
            </select>

            <input
              type="text"
              placeholder="Search by email..."
              value={emailSearch}
              onChange={(e) => {
                setEmailSearch(e.target.value);
                setPage(0);
              }}
              className="border rounded-lg px-3 py-2 w-64"
            />

            <button
              onClick={fetchClaims}
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
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Principal Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Nominee
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Claim Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Actions Requested
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
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
                        colSpan={7}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        Loading...
                      </td>
                    </tr>
                  ) : claims.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        No nominee claims found
                      </td>
                    </tr>
                  ) : (
                    claims.map((claim) => {
                      const statusConfig = STATUS_CONFIG[claim.status];
                      const actions = [];
                      if (claim.action_export) actions.push("Export");
                      if (claim.action_deletion) actions.push("Deletion");

                      return (
                        <tr key={claim.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">
                              {claim.principal_email}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">
                              {claim.nominee?.nominee_name || claim.nominee_email}
                            </div>
                            <div className="text-xs text-gray-500">
                              {claim.nominee_email}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600">
                              {CLAIM_TYPE_LABELS[claim.claim_type]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {actions.map((a) => (
                                <span
                                  key={a}
                                  className="inline-flex px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-700"
                                >
                                  {a}
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
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {formatDate(claim.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => openDetail(claim.id)}
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                <div className="text-sm text-gray-600">
                  Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Detail Modal */}
          {showModal && selectedClaim && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-bold">Nominee Claim Details</h2>
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
                    {/* Nominee Info */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-medium text-gray-900 mb-3">Nominee Information</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-gray-500">Name</label>
                          <div className="font-medium">
                            {selectedClaim.nominee?.nominee_name || "—"}
                          </div>
                        </div>
                        <div>
                          <label className="text-sm text-gray-500">Email</label>
                          <div className="font-medium">{selectedClaim.nominee_email}</div>
                        </div>
                        <div>
                          <label className="text-sm text-gray-500">Relationship</label>
                          <div>
                            {selectedClaim.nominee?.relationship
                              ? RELATIONSHIP_LABELS[selectedClaim.nominee.relationship]
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <label className="text-sm text-gray-500">Principal Email</label>
                          <div className="font-medium">{selectedClaim.principal_email}</div>
                        </div>
                      </div>
                    </div>

                    {/* Claim Details */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-gray-500">Claim Type</label>
                        <div className="font-medium">
                          {CLAIM_TYPE_LABELS[selectedClaim.claim_type]}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500">Status</label>
                        <div>
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${STATUS_CONFIG[selectedClaim.status].bgColor} ${STATUS_CONFIG[selectedClaim.status].color}`}
                          >
                            {STATUS_CONFIG[selectedClaim.status].label}
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500">Actions Requested</label>
                        <div className="flex gap-2 mt-1">
                          {selectedClaim.action_export && (
                            <span className="inline-flex px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700">
                              Data Export
                            </span>
                          )}
                          {selectedClaim.action_deletion && (
                            <span className="inline-flex px-2 py-0.5 text-xs rounded bg-red-100 text-red-700">
                              Data Deletion
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500">Submitted</label>
                        <div>{formatDate(selectedClaim.created_at)}</div>
                      </div>
                      {selectedClaim.processed_at && (
                        <div>
                          <label className="text-sm text-gray-500">Processed At</label>
                          <div>{formatDate(selectedClaim.processed_at)}</div>
                        </div>
                      )}
                      {selectedClaim.ip_address && (
                        <div>
                          <label className="text-sm text-gray-500">IP Address</label>
                          <div className="text-sm text-gray-600">{selectedClaim.ip_address}</div>
                        </div>
                      )}
                    </div>

                    {/* Document Section */}
                    <div className="border-t pt-4">
                      <h3 className="font-medium text-gray-900 mb-3">Proof Document</h3>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-700">
                            {selectedClaim.document_filename}
                          </div>
                          <div className="text-xs text-gray-500">
                            {selectedClaim.document_content_type}
                          </div>
                          {selectedClaim.document_retained_until && (
                            <div className="text-xs text-gray-400 mt-1">
                              Retained until {formatDate(selectedClaim.document_retained_until)}
                            </div>
                          )}
                        </div>
                        {selectedClaim.document_path !== "deleted" ? (
                          <button
                            onClick={() => handleDownloadDocument(selectedClaim.id)}
                            disabled={docLoading}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            {docLoading ? "Loading..." : "View Document"}
                          </button>
                        ) : (
                          <span className="text-sm text-gray-400 italic">
                            Document deleted (retention expired)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Existing Admin Notes */}
                    {selectedClaim.admin_notes && (
                      <div>
                        <label className="text-sm text-gray-500">Admin Notes</label>
                        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                          {selectedClaim.admin_notes}
                        </div>
                      </div>
                    )}

                    {/* Admin Actions */}
                    {(selectedClaim.status === "pending" ||
                      selectedClaim.status === "verified") && (
                      <div className="border-t pt-4 space-y-4">
                        <h3 className="font-medium text-gray-900">Admin Actions</h3>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Notes
                          </label>
                          <textarea
                            value={actionNotes}
                            onChange={(e) => setActionNotes(e.target.value)}
                            rows={3}
                            placeholder={
                              selectedClaim.status === "pending"
                                ? "Verification notes or rejection reason..."
                                : "Details of actions taken (export sent, data deleted, etc.)..."
                            }
                            className="w-full border rounded-lg px-3 py-2 resize-vertical"
                          />
                        </div>

                        <div className="flex flex-wrap gap-3">
                          {selectedClaim.status === "pending" && (
                            <>
                              <button
                                onClick={() => handleAction("verify")}
                                disabled={actionLoading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                              >
                                {actionLoading ? "Processing..." : "Verify Claim"}
                              </button>
                              <button
                                onClick={() => handleAction("reject")}
                                disabled={actionLoading}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                              >
                                {actionLoading ? "Processing..." : "Reject Claim"}
                              </button>
                            </>
                          )}
                          {selectedClaim.status === "verified" && (
                            <button
                              onClick={() => handleAction("complete")}
                              disabled={actionLoading}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                              {actionLoading ? "Processing..." : "Mark Completed"}
                            </button>
                          )}
                        </div>

                        {selectedClaim.status === "pending" && (
                          <p className="text-xs text-gray-500">
                            Review the uploaded proof document before verifying. Verify confirms
                            the claim is legitimate. After verifying, use existing admin tools to
                            perform the requested export/deletion, then mark as completed.
                          </p>
                        )}
                        {selectedClaim.status === "verified" && (
                          <p className="text-xs text-gray-500">
                            Ensure you have already performed the requested actions (data
                            export and/or deletion) using the existing admin tools before marking
                            as completed. The nominee will be notified.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Close button */}
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
      </div>
    </div>
  );
}
