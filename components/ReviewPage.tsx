"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import StarRating from "./StarRating";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

interface TokenData {
  valid: boolean;
  reason?: string;
  productName?: string;
  productImage?: string | null;
  productId?: string | null;
}

const REVIEW_PROMPTS = [
  "How was the quality of the product?",
  "Did it meet your expectations?",
  "How did it perform for your plants/soil?",
  "Would you recommend this to others?",
];

const toastStyle = {
  background: "#3d3c30",
  color: "#e0dbb5",
  borderRadius: "8px",
};

export default function ReviewPage({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function verifyToken() {
      try {
        const res = await fetch(`/api/reviews/verify-token?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        setTokenData(data);
      } catch {
        setTokenData({ valid: false, reason: "invalid" });
      } finally {
        setLoading(false);
      }
    }
    verifyToken();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (rating === 0) {
      toast.error("Please select a star rating", {
        position: "top-center",
        autoClose: 3000,
        theme: "colored",
        style: toastStyle,
      });
      return;
    }

    if (reviewText && reviewText.length < 10) {
      toast.error("Review text must be at least 10 characters", {
        position: "top-center",
        autoClose: 3000,
        theme: "colored",
        style: toastStyle,
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          rating,
          review_text: reviewText || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to submit review", {
          position: "top-center",
          autoClose: 3000,
          theme: "colored",
          style: toastStyle,
        });
        return;
      }

      setSubmitted(true);
    } catch {
      toast.error("Something went wrong. Please try again.", {
        position: "top-center",
        autoClose: 3000,
        theme: "colored",
        style: toastStyle,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function insertPrompt(prompt: string) {
    const prefix = reviewText ? reviewText.trimEnd() + " " : "";
    setReviewText(prefix + prompt + " ");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#2f2e25] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#bdb88c]"></div>
      </div>
    );
  }

  if (!tokenData?.valid) {
    const messages: Record<string, { title: string; description: string }> = {
      expired: {
        title: "Link Expired",
        description: "This review link has expired. Review links are valid for 30 days after delivery.",
      },
      used: {
        title: "Already Reviewed",
        description: "This review link has already been used. Thank you for your feedback!",
      },
      order_cancelled: {
        title: "Order Status Changed",
        description: "A review cannot be submitted for this order as it has been returned or cancelled.",
      },
      invalid: {
        title: "Invalid Link",
        description: "This review link is not valid. Please check the link from your email.",
      },
    };

    const msg = messages[tokenData?.reason || "invalid"];

    return (
      <div className="min-h-screen bg-[#2f2e25] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#3d3c30] rounded-xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#e0dbb5] mb-2">{msg.title}</h2>
          <p className="text-[#c5c0a0]">{msg.description}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#2f2e25] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#3d3c30] rounded-xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#e0dbb5] mb-2">Thank You!</h2>
          <p className="text-[#c5c0a0]">Your review has been submitted successfully. It helps other customers make informed decisions.</p>
          <a
            href="/products"
            className="inline-block mt-6 px-6 py-3 bg-[#bdb88c] text-[#2f2e25] rounded-lg font-semibold hover:bg-[#a8a379] transition-colors"
          >
            Continue Shopping
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#2f2e25] py-8 px-4">
      <ToastContainer />
      <div className="max-w-lg mx-auto">
        <div className="bg-[#3d3c30] rounded-xl p-6 md:p-8">
          <h1 className="text-2xl font-bold text-[#e0dbb5] mb-6">Leave a Review</h1>

          {/* Product info */}
          <div className="flex items-center gap-4 mb-8 p-4 bg-[#2f2e25] rounded-lg">
            {tokenData.productImage && (
              <div className="w-16 h-16 relative flex-shrink-0 rounded-lg overflow-hidden">
                <Image
                  src={tokenData.productImage}
                  alt={tokenData.productName || "Product"}
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <div>
              <p className="text-[#e0dbb5] font-semibold">{tokenData.productName}</p>
              <p className="text-[#c5c0a0] text-sm flex items-center gap-1">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Verified Purchase
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Star rating */}
            <div className="mb-6">
              <label className="block text-[#e0dbb5] font-medium mb-3">
                Your Rating <span className="text-red-400">*</span>
              </label>
              <StarRating
                rating={rating}
                size="lg"
                interactive
                onRate={setRating}
              />
              {rating > 0 && (
                <p className="text-[#c5c0a0] text-sm mt-1">
                  {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][rating]}
                </p>
              )}
            </div>

            {/* Review text */}
            <div className="mb-4">
              <label className="block text-[#e0dbb5] font-medium mb-2">
                Your Review <span className="text-[#c5c0a0] text-sm font-normal">(optional)</span>
              </label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share your experience with this product..."
                rows={4}
                maxLength={1000}
                className="w-full px-4 py-3 bg-[#2f2e25] text-[#e0dbb5] placeholder-[#7a7660] border border-[#555440] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#bdb88c] resize-none"
              />
              <p className="text-[#7a7660] text-xs mt-1 text-right">
                {reviewText.length}/1000
              </p>
            </div>

            {/* Review prompts */}
            <div className="mb-8">
              <p className="text-[#c5c0a0] text-sm mb-2">Need inspiration? Try these:</p>
              <div className="flex flex-wrap gap-2">
                {REVIEW_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => insertPrompt(prompt)}
                    className="text-xs px-3 py-1.5 bg-[#2f2e25] text-[#c5c0a0] rounded-full border border-[#555440] hover:border-[#bdb88c] hover:text-[#e0dbb5] transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={submitting || rating === 0}
              className="w-full py-3 bg-[#bdb88c] text-[#2f2e25] rounded-lg font-semibold hover:bg-[#a8a379] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Review"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
