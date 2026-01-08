"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

type Step = "FORM" | "OTP" | "DONE";

// Validation rules based on backend schema
const validation = {
  orderId: {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    message: "Please enter a valid Order ID (UUID format)",
  },
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: "Please enter a valid email address",
  },
  otp: {
    pattern: /^[0-9]{6}$/,
    message: "OTP must be exactly 6 digits",
  },
  reason: {
    minLength: 10,
    maxLength: 500,
    message: "Reason must be 10-500 characters if provided",
  },
};

export default function CancelOrderPage() {
  const [step, setStep] = useState<Step>("FORM");
  const [orderId, setOrderId] = useState("");
  const [contact, setContact] = useState("");
  const [otp, setOtp] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Validate a single field
  const validateField = useCallback((field: string, value: string): string => {
    if (field === "orderId") {
      if (!value) return "Order ID is required";
      if (!validation.orderId.pattern.test(value)) return validation.orderId.message;
    }
    if (field === "email") {
      if (!value) return "Email is required";
      if (!validation.email.pattern.test(value)) return validation.email.message;
    }
    if (field === "otp") {
      if (!value) return "OTP is required";
      if (!validation.otp.pattern.test(value)) return validation.otp.message;
    }
    if (field === "reason" && value) {
      if (value.length < validation.reason.minLength) return validation.reason.message;
      if (value.length > validation.reason.maxLength) return `Reason is too long (max ${validation.reason.maxLength} characters)`;
    }
    return "";
  }, []);

  // Handle field blur
  const handleBlur = (field: string, value: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const fieldError = validateField(field, value);
    setFieldErrors((prev) => ({ ...prev, [field]: fieldError }));
  };

  // Get input classes based on error state
  const getInputClasses = (field: string, extraClasses = "") =>
    `w-full bg-white border text-gray-800 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#3d3c30] focus:border-transparent outline-none transition-all ${
      touched[field] && fieldErrors[field]
        ? "border-red-500 focus:ring-red-500"
        : "border-gray-300"
    } ${extraClasses}`;

  // Error message component
  const ErrorMessage = ({ field }: { field: string }) =>
    touched[field] && fieldErrors[field] ? (
      <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        {fieldErrors[field]}
      </p>
    ) : null;

  // Check if form is valid
  const isFormValid = () => {
    const orderIdError = validateField("orderId", orderId);
    const emailError = validateField("email", contact);
    return !orderIdError && !emailError;
  };

  // Check if OTP form is valid
  const isOtpFormValid = () => {
    const otpError = validateField("otp", otp);
    const reasonError = reason ? validateField("reason", reason) : "";
    return !otpError && !reasonError;
  };

  const sendOtp = async () => {
    // Validate before sending
    const orderIdError = validateField("orderId", orderId);
    const emailError = validateField("email", contact);

    setFieldErrors({ orderId: orderIdError, email: emailError });
    setTouched({ orderId: true, email: true });

    if (orderIdError || emailError) return;

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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const confirmCancellation = async () => {
    // Validate before confirming
    const otpError = validateField("otp", otp);
    const reasonError = reason ? validateField("reason", reason) : "";

    setFieldErrors((prev) => ({ ...prev, otp: otpError, reason: reasonError }));
    setTouched((prev) => ({ ...prev, otp: true, reason: !!reason }));

    if (otpError || reasonError) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          otp,
          reason: reason || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Cancellation failed");

      setStep("DONE");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      {/* Header */}
      <div className="bg-[#3d3c30] text-[#e0dbb5] py-6 px-4 sm:px-6">
        <div className="max-w-xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm hover:text-white transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to store
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold">Cancel Order</h1>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center">
            <StepIndicator number={1} label="Details" active={step === "FORM"} completed={step !== "FORM"} />
            <StepConnector completed={step !== "FORM"} />
            <StepIndicator number={2} label="Verify" active={step === "OTP"} completed={step === "DONE"} />
            <StepConnector completed={step === "DONE"} />
            <StepIndicator number={3} label="Done" active={step === "DONE"} completed={false} />
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Error Message */}
          {error && (
            <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Step 1: Order Details */}
          {step === "FORM" && (
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-[#f5f5f0] rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[#3d3c30]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Enter Order Details</h2>
                <p className="text-gray-500 text-sm">
                  We&apos;ll send a verification code to confirm your identity
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Order ID</label>
                  <input
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value.trim())}
                    onBlur={() => handleBlur("orderId", orderId)}
                    className={getInputClasses("orderId")}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                  <ErrorMessage field="orderId" />
                  {!fieldErrors.orderId && (
                    <p className="text-xs text-gray-500 mt-1">
                      You can find this in your order confirmation email
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={contact}
                    onChange={(e) => setContact(e.target.value.trim())}
                    onBlur={() => handleBlur("email", contact)}
                    className={getInputClasses("email")}
                    placeholder="your@email.com"
                  />
                  <ErrorMessage field="email" />
                </div>

                <button
                  disabled={loading || !isFormValid()}
                  onClick={sendOtp}
                  className={`w-full py-3.5 rounded-full font-semibold transition-all flex items-center justify-center gap-2 ${
                    !loading && isFormValid()
                      ? "bg-[#3d3c30] text-white hover:bg-[#4a493a]"
                      : "bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {loading ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending OTP...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Send Verification Code
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: OTP Verification */}
          {step === "OTP" && (
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-[#f5f5f0] rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[#3d3c30]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Verify Your Identity</h2>
                <p className="text-gray-500 text-sm">
                  Enter the 6-digit code sent to <span className="font-medium text-gray-700">{contact}</span>
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Verification Code</label>
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onBlur={() => handleBlur("otp", otp)}
                    className={getInputClasses("otp", "text-center tracking-[0.5em] text-lg font-mono")}
                    placeholder="000000"
                    maxLength={6}
                  />
                  <ErrorMessage field="otp" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Reason for Cancellation <span className="text-gray-400">(optional, min 10 chars)</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    onBlur={() => reason && handleBlur("reason", reason)}
                    className={getInputClasses("reason", "resize-none")}
                    rows={3}
                    maxLength={500}
                    placeholder="Tell us why you're cancelling this order..."
                  />
                  <ErrorMessage field="reason" />
                  {reason && !fieldErrors.reason && (
                    <p className="text-xs text-gray-500 mt-1 text-right">
                      {reason.length}/500 characters
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("FORM");
                      setOtp("");
                      setReason("");
                      setError(null);
                      setFieldErrors({});
                      setTouched({});
                    }}
                    className="flex-1 py-3 border border-gray-300 rounded-full font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Go Back
                  </button>
                  <button
                    disabled={loading || !isOtpFormValid()}
                    onClick={confirmCancellation}
                    className={`flex-1 py-3.5 rounded-full font-semibold transition-all flex items-center justify-center gap-2 ${
                      !loading && isOtpFormValid()
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-gray-200 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    {loading ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Cancelling...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Confirm Cancellation
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={loading}
                  className="w-full text-sm text-[#3d3c30] hover:underline"
                >
                  Didn&apos;t receive the code? Resend
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === "DONE" && (
            <div className="p-6 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-gray-800 mb-2">Order Cancelled</h2>
              <p className="text-gray-600 mb-6 max-w-sm mx-auto">
                Your order has been successfully cancelled. If your payment was already processed, the refund will be initiated automatically.
              </p>

              <div className="bg-[#f5f5f0] rounded-lg p-4 mb-6">
                <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                  <svg className="w-5 h-5 text-[#3d3c30]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Refund typically takes 5-7 business days
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/"
                  className="flex-1 py-3.5 bg-[#3d3c30] text-white rounded-full font-semibold hover:bg-[#4a493a] transition-colors text-center"
                >
                  Continue Shopping
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Need help?{" "}
            <Link href="/contact" className="text-[#3d3c30] font-medium hover:underline">
              Contact Support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({
  number,
  label,
  active,
  completed,
}: {
  number: number;
  label: string;
  active: boolean;
  completed: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
          completed
            ? "bg-green-600 text-white"
            : active
            ? "bg-[#3d3c30] text-white"
            : "bg-gray-200 text-gray-500"
        }`}
      >
        {completed ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          number
        )}
      </div>
      <span
        className={`text-xs mt-1 ${
          active ? "text-[#3d3c30] font-medium" : "text-gray-500"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function StepConnector({ completed }: { completed: boolean }) {
  return (
    <div
      className={`w-12 sm:w-16 h-0.5 mx-2 transition-all ${
        completed ? "bg-green-600" : "bg-gray-200"
      }`}
    />
  );
}
