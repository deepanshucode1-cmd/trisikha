"use client";

import { useState } from "react";
import Link from "next/link";

type Order = {
  id: string;
  guest_email: string;
  guest_phone: string;
  total_amount: number;
  currency: string;
  payment_status: string;
  shipping_status: string;
  order_status: string;
  shipping_first_name: string;
  shipping_last_name: string;
  shipping_city: string;
  shipping_state: string;
  shipping_pincode: string;
  created_at: string;
  items: {
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
  }[];
};

type Step = "email" | "otp" | "data";

export default function MyDataPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [otpExpiry, setOtpExpiry] = useState<Date | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");

  // Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/guest/send-data-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send OTP");
      }

      setSuccess("If orders exist for this email, an OTP has been sent. Please check your inbox.");
      if (data.expiresAt) {
        setOtpExpiry(new Date(data.expiresAt));
      }
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/guest/verify-data-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.attemptsRemaining !== undefined) {
          setAttemptsRemaining(data.attemptsRemaining);
        }
        throw new Error(data.error || "Invalid OTP");
      }

      setSessionToken(data.sessionToken);
      setSuccess("");

      // Fetch data immediately after verification
      await fetchData(data.sessionToken);
      setStep("data");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify OTP");
    } finally {
      setLoading(false);
    }
  };

  // Fetch data
  const fetchData = async (token: string) => {
    try {
      const res = await fetch("/api/guest/get-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sessionToken: token }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch data");
      }

      setOrders(data.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    }
  };

  // Export data
  const handleExportData = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/guest/export-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sessionToken }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to export data");
      }

      // Download the JSON file
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trishikha-data-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess("Your data has been downloaded successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export data");
    } finally {
      setLoading(false);
    }
  };

  // Delete data
  const handleDeleteData = async () => {
    if (deletePhrase !== "DELETE MY DATA") {
      setError("Please type 'DELETE MY DATA' exactly to confirm");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/guest/delete-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sessionToken, confirmPhrase: deletePhrase }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete data");
      }

      setSuccess(`Your data has been deleted. ${data.details?.ordersAnonymized || 0} order(s) were anonymized.`);
      setShowDeleteConfirm(false);
      setOrders([]);
      setStep("email");
      setEmail("");
      setSessionToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete data");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="text-green-700 hover:text-green-800 text-sm mb-4 inline-block">
            &larr; Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">My Data</h1>
          <p className="mt-2 text-gray-600">
            Access, download, or delete your personal data
          </p>
          <p className="mt-1 text-sm text-gray-500">
            DPDP Act 2023 - Your data rights
          </p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700">{success}</p>
          </div>
        )}

        {/* Step 1: Email Input */}
        {step === "email" && (
          <div className="bg-white shadow-sm rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Verify Your Email
            </h2>
            <p className="text-gray-600 mb-6">
              Enter the email address you used to place orders. We&apos;ll send you a one-time password to verify your identity.
            </p>

            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="your@email.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-3 px-4 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending..." : "Send Verification Code"}
              </button>
            </form>
          </div>
        )}

        {/* Step 2: OTP Verification */}
        {step === "otp" && (
          <div className="bg-white shadow-sm rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Enter Verification Code
            </h2>
            <p className="text-gray-600 mb-2">
              We&apos;ve sent a 6-digit code to <strong>{email}</strong>
            </p>
            {otpExpiry && (
              <p className="text-sm text-gray-500 mb-6">
                Code expires at {otpExpiry.toLocaleTimeString()}
              </p>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1">
                  Verification Code
                </label>
                <input
                  type="text"
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  maxLength={6}
                  placeholder="000000"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-center text-2xl tracking-widest"
                />
                {attemptsRemaining < 5 && (
                  <p className="mt-1 text-sm text-orange-600">
                    {attemptsRemaining} attempts remaining
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full py-3 px-4 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Verifying..." : "Verify"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setOtp("");
                  setError("");
                }}
                className="w-full py-2 text-gray-600 hover:text-gray-800"
              >
                Use a different email
              </button>
            </form>
          </div>
        )}

        {/* Step 3: Data Display */}
        {step === "data" && (
          <>
            {/* Actions */}
            <div className="bg-white shadow-sm rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Your Data for {email}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={handleExportData}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download My Data
                </button>

                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 py-3 px-4 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete My Data
                </button>
              </div>

              <p className="mt-4 text-sm text-gray-500">
                Data export includes all your order history in machine-readable JSON format.
              </p>
            </div>

            {/* Orders List */}
            <div className="bg-white shadow-sm rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Your Orders ({orders.length})
              </h3>

              {orders.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No orders found for this email address.
                </p>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium text-gray-900">
                            Order #{order.id.slice(0, 8)}...
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatDate(order.created_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">
                            {formatCurrency(order.total_amount)}
                          </p>
                          <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                            order.shipping_status === "delivered"
                              ? "bg-green-100 text-green-700"
                              : order.shipping_status === "cancelled"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}>
                            {order.shipping_status}
                          </span>
                        </div>
                      </div>

                      {/* Order Items */}
                      <div className="mt-2 space-y-1">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex justify-between text-sm text-gray-600">
                            <span>{item.product_name} x{item.quantity}</span>
                            <span>{formatCurrency(item.unit_price * item.quantity)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Shipping Info */}
                      <div className="mt-3 pt-2 border-t border-gray-100 text-sm text-gray-500">
                        <p>
                          Shipped to: {order.shipping_first_name} {order.shipping_last_name}, {order.shipping_city}, {order.shipping_state} - {order.shipping_pincode}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">About Your Data Rights</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>Access:</strong> You can view all data we store about you</li>
                <li>• <strong>Portability:</strong> Download your data in JSON format</li>
                <li>• <strong>Erasure:</strong> Request deletion of your personal data</li>
                <li>• <strong>Retention:</strong> Order records are kept for 7 years (tax compliance) but personal info can be anonymized</li>
              </ul>
              <p className="mt-2 text-sm text-blue-700">
                For questions, contact us at <a href="mailto:trishikhaorganic@gmail.com" className="underline">trishikhaorganic@gmail.com</a>
              </p>
            </div>
          </>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-red-600 mb-4">
                Delete Your Data
              </h3>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-700 text-sm">
                  <strong>Warning:</strong> This action cannot be undone. Your personal information will be permanently anonymized.
                </p>
              </div>

              <p className="text-gray-600 mb-4">
                Order records will be retained for tax compliance but all identifying information (name, email, phone, address) will be removed.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type <strong>DELETE MY DATA</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={deletePhrase}
                  onChange={(e) => setDeletePhrase(e.target.value)}
                  placeholder="DELETE MY DATA"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletePhrase("");
                  }}
                  className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteData}
                  disabled={loading || deletePhrase !== "DELETE MY DATA"}
                  className="flex-1 py-2 px-4 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Deleting..." : "Delete My Data"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
