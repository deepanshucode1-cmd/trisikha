"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadRazorpayScript, openRazorpayCheckout } from "@/lib/razorpay-client";

interface PayButtonProps {
  token: string;
  prefillEmail: string;
  prefillContact: string;
}

export default function PayButton({ token, prefillEmail, prefillContact }: PayButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadRazorpayScript().catch(() => {
      setError("Failed to load payment library. Please refresh and try again.");
    });
  }, []);

  const handlePay = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/guest/resume-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to start payment. Please try again.");
        setLoading(false);
        return;
      }

      openRazorpayCheckout({
        key: data.key,
        amount: data.amount * 100,
        currency: data.currency,
        razorpayOrderId: data.razorpay_order_id,
        prefill: { email: prefillEmail, contact: prefillContact },
        onSuccess: async (response) => {
          try {
            const verifyRes = await fetch("/api/payment/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                order_id: data.order_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            if (verifyRes.ok) {
              router.push(`/payment/success?orderId=${data.order_id}&email=${encodeURIComponent(prefillEmail)}`);
            } else {
              router.push(`/payment/failed?reason=verification_failed`);
            }
          } catch {
            router.push(`/payment/failed?reason=server_error`);
          }
        },
        onFailure: () => {
          router.push(`/payment/failed?reason=failed`);
        },
        onDismiss: () => {
          setLoading(false);
        },
      });
    } catch {
      setError("Could not start payment. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}
      <button
        onClick={handlePay}
        disabled={loading}
        className="w-full bg-[#3d3c30] text-white py-4 rounded-lg font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Opening payment..." : `Pay Now`}
      </button>
    </div>
  );
}
