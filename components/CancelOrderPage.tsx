"use client";

import { useState } from "react";

export default function CancelOrderPage() {
  const [step, setStep] = useState<"FORM" | "OTP" | "DONE">("FORM");
  const [orderId, setOrderId] = useState("");
  const [contact, setContact] = useState("");
  const [otp, setOtp] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ SEND OTP
  const sendOtp = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/orders/send-cancel-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          emailOrPhone: contact,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to send OTP");

      setStep("OTP");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ FINAL CANCELLATION
  const confirmCancellation = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          otp,
          reason,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Cancellation failed");

      setStep("DONE");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf7f2] flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-white border border-gray-200 shadow-lg rounded-xl p-8">
        <h1 className="text-3xl font-bold text-center text-green-800 mb-2">
          Cancel Your Order
        </h1>
        <p className="text-center text-gray-600 mb-6">
          Enter your order details to initiate cancellation
        </p>

        {/* ✅ ERROR */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* ✅ STEP 1: ORDER DETAILS */}
        {step === "FORM" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Order ID
              </label>
              <input
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-green-600"
                placeholder="Enter your Order ID"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Email or Phone
              </label>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-green-600"
                placeholder="Registered Email or Phone"
              />
            </div>

            <button
              disabled={loading}
              onClick={sendOtp}
              className="w-full py-3 bg-green-700 hover:bg-green-800 text-white rounded-md font-semibold transition"
            >
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
          </div>
        )}

        {/* ✅ STEP 2: OTP + REASON */}
        {step === "OTP" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Enter OTP
              </label>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full rounded-md border px-3 py-2 tracking-widest text-center"
                placeholder="6-digit OTP"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Cancellation Reason
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
                rows={3}
                placeholder="Optional reason for cancellation"
              />
            </div>

            <button
              disabled={loading}
              onClick={confirmCancellation}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-md font-semibold transition"
            >
              {loading ? "Cancelling..." : "Confirm Cancellation"}
            </button>
          </div>
        )}

        {/* ✅ SUCCESS */}
        {step === "DONE" && (
          <div className="text-center space-y-4">
            <div className="text-green-600 text-4xl">✅</div>
            <h2 className="text-2xl font-bold text-green-800">
              Order Cancelled Successfully
            </h2>
            <p className="text-gray-600">
              If your payment was completed, the refund will be processed
              automatically in 5–7 business days.
            </p>

            <a
              href="/"
              className="inline-block mt-4 px-6 py-2 bg-green-700 text-white rounded-md"
            >
              Back to Home
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
