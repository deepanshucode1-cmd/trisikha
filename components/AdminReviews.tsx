"use client";

import { useState, useEffect, useCallback } from "react";
import { useCsrf } from "@/hooks/useCsrf";
import StarRating from "./StarRating";

interface Review {
  id: string;
  product_id: string | null;
  product_name: string;
  order_id: string;
  rating: number;
  review_text: string | null;
  helpful_count: number;
  is_visible: boolean;
  removed_by_admin_at: string | null;
  removal_reason: string | null;
  created_at: string;
}

interface Stats {
  totalReviews: number;
  visibleReviews: number;
  removedReviews: number;
  avgRating: number | null;
}

export default function AdminReviews() {
  const { csrfFetch, getCsrfHeaders } = useCsrf();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "true" | "false">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Remove modal
  const [removeModal, setRemoveModal] = useState<{ reviewId: string; productName: string } | null>(null);
  const [removeReason, setRemoveReason] = useState("");

  const LIMIT = 20;

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/reviews?page=${page}&limit=${LIMIT}&visible=${filter}`
      );
      const data = await res.json();
      if (res.ok) {
        setReviews(data.reviews);
        setTotal(data.total);
        setStats(data.stats);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  async function handleRemove() {
    if (!removeModal) return;
    setActionLoading(removeModal.reviewId);
    try {
      const res = await csrfFetch(`/api/admin/reviews/${removeModal.reviewId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({ reason: removeReason || undefined }),
      });

      if (res.ok) {
        setRemoveModal(null);
        setRemoveReason("");
        fetchReviews();
      }
    } catch {
      // Silent
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRestore(reviewId: string) {
    setActionLoading(reviewId);
    try {
      const res = await csrfFetch(`/api/admin/reviews/${reviewId}`, {
        method: "PATCH",
        headers: getCsrfHeaders(),
      });

      if (res.ok) {
        fetchReviews();
      }
    } catch {
      // Silent
    } finally {
      setActionLoading(null);
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Review Management</h1>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <p className="text-sm text-gray-500">Total Reviews</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalReviews}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <p className="text-sm text-gray-500">Visible</p>
              <p className="text-2xl font-bold text-green-600">{stats.visibleReviews}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <p className="text-sm text-gray-500">Removed</p>
              <p className="text-2xl font-bold text-red-600">{stats.removedReviews}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <p className="text-sm text-gray-500">Avg Rating</p>
              <p className="text-2xl font-bold text-amber-600">
                {stats.avgRating ? stats.avgRating.toFixed(1) : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-gray-600">Filter:</span>
          {(["all", "true", "false"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 border hover:bg-gray-50"
              }`}
            >
              {f === "all" ? "All" : f === "true" ? "Visible" : "Removed"}
            </button>
          ))}
        </div>

        {/* Reviews table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No reviews found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Rating</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Review</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Helpful</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {reviews.map((review) => (
                    <tr key={review.id} className={`${!review.is_visible ? "bg-red-50/50" : ""}`}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 line-clamp-1 max-w-[150px] block">
                          {review.product_name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StarRating rating={review.rating} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-600 line-clamp-2 max-w-[300px]">
                          {review.review_text || <span className="text-gray-400 italic">No text</span>}
                        </p>
                        {review.removal_reason && (
                          <p className="text-xs text-red-500 mt-1">
                            Removed: {review.removal_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {review.helpful_count}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(review.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {review.is_visible ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            Visible
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            Hidden
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {review.is_visible ? (
                          <button
                            onClick={() =>
                              setRemoveModal({
                                reviewId: review.id,
                                productName: review.product_name,
                              })
                            }
                            disabled={actionLoading === review.id}
                            className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-50"
                          >
                            {actionLoading === review.id ? "..." : "Remove"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRestore(review.id)}
                            disabled={actionLoading === review.id}
                            className="text-green-600 hover:text-green-800 text-xs font-medium disabled:opacity-50"
                          >
                            {actionLoading === review.id ? "..." : "Restore"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages} ({total} reviews)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-sm bg-white border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-sm bg-white border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Remove confirmation modal */}
      {removeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Remove Review</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will hide the review for <strong>{removeModal.productName}</strong> from the public product page.
            </p>
            <textarea
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              placeholder="Reason for removal (optional)"
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setRemoveModal(null); setRemoveReason(""); }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={actionLoading !== null}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? "Removing..." : "Remove Review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
