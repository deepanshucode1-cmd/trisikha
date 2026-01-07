"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function PaymentFailedContent() {
  const searchParams = useSearchParams();

  const orderId = searchParams.get("orderId");
  const reason = searchParams.get("reason");

  return (
    <div className="min-h-screen bg-[#3d3c30] text-[#e0dbb5] flex items-center justify-center px-6">
      <div className="bg-[#464433] rounded-2xl shadow-lg max-w-lg w-full p-8 text-center">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="h-20 w-20 rounded-full bg-red-900/30 flex items-center justify-center">
            <span className="text-4xl">❌</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold mb-3">
          Payment Failed
        </h1>

        <p className="text-[#d1cd9f] mb-6">
          Unfortunately, your payment could not be completed.
        </p>

        {/* Order Info */}
        {orderId && (
          <div className="bg-[#3d3c30] border border-[#6a684d] rounded-lg p-4 mb-6">
            <p className="text-sm text-[#bdb88c] mb-1">Order ID</p>
            <p className="font-mono text-sm break-all">{orderId}</p>
          </div>
        )}

        {/* Failure Reason */}
        {reason && (
          <p className="text-sm text-red-300 mb-4">
            Reason: {reason.replace(/_/g, " ")}
          </p>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {orderId && (
            <Link
              href={`/checkout?orderId=${orderId}`}
              className="block w-full bg-[#6a684d] hover:bg-[#7a785a] text-[#e0dbb5] px-6 py-3 rounded-full transition"
            >
              Retry Payment
            </Link>
          )}

          <Link
            href="/products"
            className="block w-full border border-[#6a684d] hover:bg-[#3d3c30] px-6 py-3 rounded-full transition"
          >
            Continue Shopping
          </Link>
        </div>

        {/* Help */}
        <p className="text-xs text-[#bdb88c] mt-6">
          Need help? Contact support.
        </p>
      </div>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#3d3c30] text-[#e0dbb5] flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    }>
      <PaymentFailedContent />
    </Suspense>
  );
}
