"use client";

import { useState } from "react";
import StarRating from "./StarRating";
import { toast } from "react-toastify";

interface Review {
  id: string;
  rating: number;
  review_text: string | null;
  helpful_count: number;
  created_at: string;
}

interface ProductReviewsProps {
  productId: string;
  initialReviews: Review[];
  initialTotal: number;
  avgRating: number | null;
  reviewCount: number;
  ratingDistribution: number[];
}

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "highest", label: "Highest Rated" },
  { value: "lowest", label: "Lowest Rated" },
  { value: "most_helpful", label: "Most Helpful" },
];

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? "s" : ""} ago`;
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? "s" : ""} ago`;
}

export default function ProductReviews({
  productId,
  initialReviews,
  initialTotal,
  avgRating,
  reviewCount,
  ratingDistribution,
}: ProductReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [helpfulVoted, setHelpfulVoted] = useState<Set<string>>(
    () => {
      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("review_helpful_votes");
          return new Set(stored ? JSON.parse(stored) : []);
        } catch {
          return new Set();
        }
      }
      return new Set();
    }
  );

  const LIMIT = 10;
  const hasMore = reviews.length < total;

  async function loadMore() {
    setLoading(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(
        `/api/reviews/${productId}?page=${nextPage}&limit=${LIMIT}&sort=${sort}`
      );
      const data = await res.json();
      if (data.reviews) {
        setReviews((prev) => [...prev, ...data.reviews]);
        setPage(nextPage);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }

  async function handleSortChange(newSort: string) {
    setSort(newSort);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reviews/${productId}?page=1&limit=${LIMIT}&sort=${newSort}`
      );
      const data = await res.json();
      if (data.reviews) {
        setReviews(data.reviews);
        setTotal(data.total);
        setPage(1);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }

  async function handleHelpful(reviewId: string) {
    if (helpfulVoted.has(reviewId)) return;

    try {
      const res = await fetch(`/api/reviews/${reviewId}/helpful`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        setReviews((prev) =>
          prev.map((r) =>
            r.id === reviewId ? { ...r, helpful_count: data.helpfulCount } : r
          )
        );
        const newVoted = new Set(helpfulVoted);
        newVoted.add(reviewId);
        setHelpfulVoted(newVoted);
        try {
          localStorage.setItem(
            "review_helpful_votes",
            JSON.stringify([...newVoted])
          );
        } catch {
          // localStorage not available
        }
      } else if (data.alreadyVoted) {
        const newVoted = new Set(helpfulVoted);
        newVoted.add(reviewId);
        setHelpfulVoted(newVoted);
      }
    } catch {
      toast.error("Failed to record vote", {
        position: "top-center",
        autoClose: 2000,
      });
    }
  }

  const maxDistribution = Math.max(...ratingDistribution, 1);

  return (
    <section aria-labelledby="reviews-heading" id="reviews" className="mt-12">
      <h2
        id="reviews-heading"
        className="text-2xl font-bold text-[#e0dbb5] mb-6"
      >
        Customer Reviews
      </h2>

      {reviewCount === 0 ? (
        <div className="text-center py-12 bg-[#3d3c30] rounded-xl">
          <p className="text-[#c5c0a0] text-lg">No reviews yet.</p>
          <p className="text-[#7a7660] mt-1">Be the first to review this product!</p>
        </div>
      ) : (
        <>
          {/* Aggregate header */}
          <div className="bg-[#3d3c30] rounded-xl p-6 mb-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Average rating */}
              <div className="flex flex-col items-center justify-center md:min-w-[140px]">
                <span className="text-4xl font-bold text-[#e0dbb5]">
                  {avgRating?.toFixed(1) || "0.0"}
                </span>
                <StarRating rating={avgRating || 0} size="md" />
                <span className="text-[#c5c0a0] text-sm mt-1">
                  Based on {reviewCount} review{reviewCount !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Rating distribution */}
              <div className="flex-1 space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = ratingDistribution[star - 1] || 0;
                  const pct =
                    reviewCount > 0
                      ? Math.round((count / reviewCount) * 100)
                      : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-sm">
                      <span className="text-[#c5c0a0] w-3">{star}</span>
                      <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                      <div className="flex-1 h-2.5 bg-[#2f2e25] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all"
                          style={{
                            width: `${(count / maxDistribution) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-[#7a7660] w-10 text-right">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sort + review list */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[#c5c0a0] text-sm">
              {total} review{total !== 1 ? "s" : ""}
            </span>
            <select
              value={sort}
              onChange={(e) => handleSortChange(e.target.value)}
              className="px-3 py-1.5 bg-[#3d3c30] text-[#e0dbb5] border border-[#555440] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#bdb88c]"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reviews list */}
          <div className="space-y-4">
            {reviews.map((review) => (
              <article
                key={review.id}
                className="bg-[#3d3c30] rounded-xl p-5"
                itemScope
                itemType="https://schema.org/Review"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      itemProp="reviewRating"
                      itemScope
                      itemType="https://schema.org/Rating"
                    >
                      <meta
                        itemProp="ratingValue"
                        content={String(review.rating)}
                      />
                      <StarRating rating={review.rating} size="sm" />
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-900/30 text-green-400 rounded-full">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Verified Buyer
                    </span>
                  </div>
                  <time
                    itemProp="datePublished"
                    dateTime={review.created_at}
                    className="text-[#7a7660] text-xs"
                  >
                    {getRelativeTime(review.created_at)}
                  </time>
                </div>

                {review.review_text && (
                  <p itemProp="reviewBody" className="text-[#c5c0a0] mt-2">
                    {review.review_text}
                  </p>
                )}

                <span
                  itemProp="author"
                  itemScope
                  itemType="https://schema.org/Person"
                  className="hidden"
                >
                  <meta itemProp="name" content="Verified Buyer" />
                </span>

                {/* Helpful button */}
                <div className="mt-3 flex items-center">
                  <button
                    onClick={() => handleHelpful(review.id)}
                    disabled={helpfulVoted.has(review.id)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      helpfulVoted.has(review.id)
                        ? "border-[#555440] text-[#7a7660] cursor-default"
                        : "border-[#555440] text-[#c5c0a0] hover:border-[#bdb88c] hover:text-[#e0dbb5]"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                    </svg>
                    Helpful{review.helpful_count > 0 ? ` (${review.helpful_count})` : ""}
                  </button>
                </div>
              </article>
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="text-center mt-6">
              <button
                onClick={loadMore}
                disabled={loading}
                className="px-6 py-2.5 bg-[#3d3c30] text-[#e0dbb5] rounded-lg border border-[#555440] hover:border-[#bdb88c] transition-colors disabled:opacity-50"
              >
                {loading ? "Loading..." : "Show More Reviews"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
