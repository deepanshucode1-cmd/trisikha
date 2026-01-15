"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { XCircle, RefreshCw, ShoppingBag, HelpCircle, AlertTriangle, ArrowRight, Phone, Mail } from "lucide-react";

function PaymentFailedContent() {
  const searchParams = useSearchParams();

  const orderId = searchParams.get("orderId");
  const reason = searchParams.get("reason");

  const formatReason = (reasonCode: string) => {
    const reasons: Record<string, string> = {
      'PAYMENT_TIMEOUT': 'Payment session timed out',
      'INSUFFICIENT_FUNDS': 'Insufficient funds in your account',
      'CARD_DECLINED': 'Card was declined by your bank',
      'TECHNICAL_ERROR': 'A technical error occurred',
      'CANCELLED_BY_USER': 'Payment was cancelled',
      'INVALID_CARD': 'Card details were invalid',
    };
    return reasons[reasonCode] || reasonCode.replace(/_/g, " ");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#3d3c30] via-[#464433] to-[#3d3c30] text-[#e0dbb5] flex items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-20 left-20 opacity-5">
        <AlertTriangle className="w-40 h-40" />
      </div>
      <div className="absolute bottom-20 right-20 opacity-5">
        <AlertTriangle className="w-32 h-32" />
      </div>

      <div className="max-w-lg w-full relative z-10">
        {/* Main Card */}
        <div className="bg-[#464433]/80 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden border border-[#6a684d]/30 animate-scale-in">
          {/* Error Header */}
          <div className="bg-gradient-to-r from-red-900/30 to-red-800/20 px-6 py-8 text-center border-b border-[#6a684d]/30">
            <div className="relative inline-block mb-4">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
                <XCircle className="w-12 h-12 text-red-400" />
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">Payment Failed</h1>
            <p className="text-[#c5c0a0]">
              Unfortunately, your payment could not be completed.
            </p>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {/* Order Info */}
            {orderId && (
              <div className="bg-[#3d3c30]/50 border border-[#6a684d]/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#bdb88c]">Order ID</span>
                  <span className="font-mono text-sm bg-[#3d3c30] px-3 py-1 rounded-lg">{orderId}</span>
                </div>
              </div>
            )}

            {/* Failure Reason */}
            {reason && (
              <div className="bg-red-900/20 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-300 mb-1">Reason for failure</p>
                  <p className="text-sm text-[#c5c0a0]">{formatReason(reason)}</p>
                </div>
              </div>
            )}

            {/* Common Solutions */}
            <div className="bg-[#3d3c30]/30 rounded-xl p-4">
              <p className="text-sm font-medium mb-3 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#bdb88c]" />
                What you can try
              </p>
              <ul className="space-y-2 text-sm text-[#c5c0a0]">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-[#bdb88c] rounded-full mt-2 flex-shrink-0" />
                  <span>Check if your card has sufficient balance</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-[#bdb88c] rounded-full mt-2 flex-shrink-0" />
                  <span>Try using a different payment method</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-[#bdb88c] rounded-full mt-2 flex-shrink-0" />
                  <span>Ensure your card is enabled for online transactions</span>
                </li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              {orderId && (
                <Link
                  href={`/checkout?orderId=${orderId}`}
                  className="flex items-center justify-center gap-2 w-full bg-[#e0dbb5] text-[#3d3c30] px-6 py-3.5 rounded-xl font-semibold hover:bg-white transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry Payment
                </Link>
              )}

              <Link
                href="/products"
                className="flex items-center justify-center gap-2 w-full border-2 border-[#6a684d] hover:bg-[#3d3c30] px-6 py-3.5 rounded-xl font-semibold transition-all duration-300"
              >
                <ShoppingBag className="w-4 h-4" />
                Continue Shopping
              </Link>
            </div>
          </div>

          {/* Help Section */}
          <div className="bg-[#3d3c30]/50 px-6 py-5 border-t border-[#6a684d]/30">
            <p className="text-sm font-medium mb-3 text-center">Need help? Contact us</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="tel:+919876543210"
                className="flex items-center justify-center gap-2 text-sm text-[#bdb88c] hover:text-[#e0dbb5] transition-colors"
              >
                <Phone className="w-4 h-4" />
                +91 98765 43210
              </a>
              <span className="hidden sm:inline text-[#6a684d]">|</span>
              <a
                href="mailto:support@trishikha.com"
                className="flex items-center justify-center gap-2 text-sm text-[#bdb88c] hover:text-[#e0dbb5] transition-colors"
              >
                <Mail className="w-4 h-4" />
                support@trishikha.com
              </a>
            </div>
          </div>
        </div>

        {/* Back to Home */}
        <Link
          href="/"
          className="flex items-center justify-center gap-2 text-[#8a8778] hover:text-[#e0dbb5] mt-6 transition-colors group text-sm"
        >
          Back to Home
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-[#3d3c30] via-[#464433] to-[#3d3c30] text-[#e0dbb5] flex flex-col items-center justify-center">
        <div className="relative">
          <div className="h-16 w-16 border-4 border-[#e0dbb5]/20 rounded-full" />
          <div className="absolute inset-0 h-16 w-16 border-4 border-[#e0dbb5] border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="mt-4 text-[#c5c0a0]">Loading...</p>
      </div>
    }>
      <PaymentFailedContent />
    </Suspense>
  );
}
