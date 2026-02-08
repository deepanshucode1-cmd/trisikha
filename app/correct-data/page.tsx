"use client";

import { useState } from "react";
import Link from "next/link";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type Order = {
  id: string;
  guest_email: string;
  guest_phone: string;
  shipping_first_name: string;
  shipping_last_name: string;
  order_status: string;
  shiprocket_status: string | null;
  shipping_address_line1: string;
  shipping_city: string;
  shipping_state: string;
  shipping_pincode: string;
  created_at: string;
};

type CorrectionRequest = {
  id: string;
  orderId: string;
  fieldName: string;
  currentValue: string;
  requestedValue: string;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  processedAt: string | null;
};

type CorrectionFieldName = "name" | "phone" | "address";

type Step = "email" | "otp" | "data";

const FIELD_LABELS: Record<CorrectionFieldName, string> = {
  name: "Name",
  phone: "Phone",
  address: "Address",
};

export default function CorrectDataPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpExpiry, setOtpExpiry] = useState<Date | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);

  // Orders (only CONFIRMED ones are shown)
  const [correctableOrders, setCorrectableOrders] = useState<Order[]>([]);

  // Correction form state
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [correctionField, setCorrectionField] = useState<CorrectionFieldName>("name");
  const [correctionCurrentValue, setCorrectionCurrentValue] = useState("");
  const [correctionRequestedValue, setCorrectionRequestedValue] = useState("");

  // Existing corrections
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);

  // Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

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

      toast.success("An OTP has been sent to your email. Please check your inbox.");
      if (data.expiresAt) {
        setOtpExpiry(new Date(data.expiresAt));
      }
      setStep("otp");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

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

      // Fetch orders and existing corrections
      await Promise.all([
        fetchOrders(data.sessionToken),
        fetchCorrections(data.sessionToken),
      ]);
      setStep("data");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to verify OTP");
    } finally {
      setLoading(false);
    }
  };

  // Fetch orders and filter to CONFIRMED only
  const fetchOrders = async (token: string) => {
    try {
      const res = await fetch("/api/guest/get-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sessionToken: token }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch orders");
      }

      const allOrders = (data.orders || []) as Order[];
      setCorrectableOrders(allOrders.filter(
        (o) => o.order_status === "CONFIRMED" && (!o.shiprocket_status || o.shiprocket_status === "NOT_SHIPPED")
      ));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch orders");
    }
  };

  // Fetch existing correction requests
  const fetchCorrections = async (token: string) => {
    try {
      const params = new URLSearchParams({ email, sessionToken: token });
      const res = await fetch(`/api/guest/correct-data?${params}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setCorrections(data.requests || []);
      }
    } catch {
      // Non-critical
    }
  };

  // Pre-fill current value based on field and order
  // NOTE: Email is intentionally NOT correctable - it's the identity anchor used for OTP verification
  const getCurrentValue = (order: Order, field: CorrectionFieldName): string => {
    switch (field) {
      case "name":
        return `${order.shipping_first_name} ${order.shipping_last_name}`.trim();
      case "phone":
        return order.guest_phone;
      case "address":
        return JSON.stringify({
          address: order.shipping_address_line1,
          city: order.shipping_city,
          state: order.shipping_state,
          pincode: order.shipping_pincode,
        });
      default:
        return "";
    }
  };

  // Open correction form for an order
  const openCorrectionForm = (orderId: string) => {
    setSelectedOrderId(orderId);
    setCorrectionField("name");
    setCorrectionRequestedValue("");

    const order = correctableOrders.find((o) => o.id === orderId);
    if (order) {
      setCorrectionCurrentValue(getCurrentValue(order, "name"));
    }
  };

  // Handle field change — update current value
  const handleFieldChange = (field: CorrectionFieldName) => {
    setCorrectionField(field);
    setCorrectionRequestedValue("");

    if (selectedOrderId) {
      const order = correctableOrders.find((o) => o.id === selectedOrderId);
      if (order) {
        setCorrectionCurrentValue(getCurrentValue(order, field));
      }
    }
  };

  // Submit correction
  const handleSubmitCorrection = async () => {
    if (!selectedOrderId) return;
    if (!correctionRequestedValue.trim()) {
      toast.error("Please provide the correct value");
      return;
    }

    if (correctionCurrentValue === correctionRequestedValue) {
      toast.error("The corrected value must be different from the current value.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/guest/correct-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          sessionToken,
          fieldName: correctionField,
          currentValue: correctionCurrentValue,
          requestedValue: correctionRequestedValue,
          orderId: selectedOrderId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit correction");
      }

      toast.success(data.message || "Correction applied successfully.");
      setSelectedOrderId(null);
      setCorrectionCurrentValue("");
      setCorrectionRequestedValue("");

      // Refresh data
      await Promise.all([
        fetchOrders(sessionToken),
        fetchCorrections(sessionToken),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit correction");
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

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="text-green-700 hover:text-green-800 text-sm mb-4 inline-block">
            &larr; Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Correct Your Data</h1>
          <p className="mt-2 text-gray-600">
            Request correction of personal data on your orders
          </p>
          <p className="mt-1 text-sm text-gray-500">
            DPDP Act 2023, Rule 14 - Right to Correction
          </p>
        </div>

        <ToastContainer
          position="top-center"
          autoClose={4000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />

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

            <div className="mt-6 text-center">
              <Link href="/my-data" className="text-sm text-green-600 hover:text-green-700">
                Looking for data access or deletion? Go to My Data &rarr;
              </Link>
            </div>
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
                }}
                className="w-full py-2 text-gray-600 hover:text-gray-800"
              >
                Use a different email
              </button>
            </form>
          </div>
        )}

        {/* Step 3: Correction Data */}
        {step === "data" && (
          <>
            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                Only orders with status <strong>CONFIRMED</strong> that have <strong>not yet entered the shipping pipeline</strong> can be corrected online. Once an AWB is assigned or pickup is scheduled, please contact our Grievance Officer at{" "}
                <a href="mailto:trishikhaorganic@gmail.com" className="underline font-medium">trishikhaorganic@gmail.com</a>{" "}
                or <a href="tel:+917984130253" className="underline font-medium">+91 79841 30253</a> for manual correction (DPDP Act 2023, Rule 14).
              </p>
            </div>

            {/* Correctable Orders */}
            <div className="bg-white shadow-sm rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Correctable Orders ({correctableOrders.length})
              </h3>

              {correctableOrders.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">
                    No correctable orders found. Only confirmed orders that have not yet entered the shipping pipeline can be corrected online. For orders already in shipping, please contact our Grievance Officer at trishikhaorganic@gmail.com.
                  </p>
                  <Link
                    href="/my-data"
                    className="mt-4 inline-block text-sm text-green-600 hover:text-green-700"
                  >
                    Go to My Data to view all orders &rarr;
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {correctableOrders.map((order) => (
                    <div
                      key={order.id}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            Order #{order.id.slice(0, 8)}...
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatDate(order.created_at)}
                          </p>
                        </div>
                        <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                          CONFIRMED
                        </span>
                      </div>

                      {/* Current data summary */}
                      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-3">
                        <div>
                          <span className="text-gray-400">Name:</span>{" "}
                          {order.shipping_first_name} {order.shipping_last_name}
                        </div>
                        <div>
                          <span className="text-gray-400">Email:</span>{" "}
                          {order.guest_email}
                        </div>
                        <div>
                          <span className="text-gray-400">Phone:</span>{" "}
                          {order.guest_phone}
                        </div>
                        <div>
                          <span className="text-gray-400">City:</span>{" "}
                          {order.shipping_city}, {order.shipping_state}
                        </div>
                      </div>

                      {selectedOrderId === order.id ? (
                        /* Correction Form */
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                          <h4 className="font-medium text-gray-800 text-sm">Correct Data for This Order</h4>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Field to Correct
                            </label>
                            <select
                              value={correctionField}
                              onChange={(e) => handleFieldChange(e.target.value as CorrectionFieldName)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                            >
                              <option value="name">Name</option>
                              <option value="phone">Phone</option>
                              <option value="address">Address</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Current Value
                            </label>
                            <div className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-600 break-all">
                              {correctionField === "address"
                                ? (() => {
                                  try {
                                    const parsed = JSON.parse(correctionCurrentValue);
                                    return `${parsed.address}, ${parsed.city}, ${parsed.state} - ${parsed.pincode}`;
                                  } catch {
                                    return correctionCurrentValue;
                                  }
                                })()
                                : correctionCurrentValue}
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Correct Value
                            </label>
                            {correctionField === "address" ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  placeholder="Street address"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                  id="addr-street"
                                />
                                <div className="grid grid-cols-3 gap-2">
                                  <input
                                    type="text"
                                    placeholder="City"
                                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    id="addr-city"
                                  />
                                  <input
                                    type="text"
                                    placeholder="State"
                                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    id="addr-state"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Pincode"
                                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    id="addr-pincode"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const street = (document.getElementById("addr-street") as HTMLInputElement)?.value || "";
                                    const city = (document.getElementById("addr-city") as HTMLInputElement)?.value || "";
                                    const state = (document.getElementById("addr-state") as HTMLInputElement)?.value || "";
                                    const pincode = (document.getElementById("addr-pincode") as HTMLInputElement)?.value || "";
                                    setCorrectionRequestedValue(
                                      JSON.stringify({ address: street, city, state, pincode })
                                    );
                                  }}
                                  className="text-sm text-green-600 hover:text-green-700"
                                >
                                  Confirm address fields
                                </button>
                                {correctionRequestedValue && (
                                  <p className="text-xs text-green-600">Address fields confirmed</p>
                                )}
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={correctionRequestedValue}
                                onChange={(e) => setCorrectionRequestedValue(e.target.value)}
                                placeholder={`Enter correct ${FIELD_LABELS[correctionField].toLowerCase()}`}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                              />
                            )}
                          </div>

                          <div className="flex gap-3 pt-2">
                            <button
                              onClick={() => {
                                setSelectedOrderId(null);
                                setCorrectionCurrentValue("");
                                setCorrectionRequestedValue("");
                              }}
                              className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSubmitCorrection}
                              disabled={loading || !correctionRequestedValue.trim()}
                              className="flex-1 py-2 px-4 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {loading ? "Applying..." : "Apply Correction"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => openCorrectionForm(order.id)}
                          className="w-full py-2 px-4 text-sm bg-green-50 text-green-700 font-medium rounded-lg hover:bg-green-100 border border-green-200"
                        >
                          Request Correction
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Existing Correction Requests */}
            <div className="bg-white shadow-sm rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Correction History
              </h3>

              {corrections.length === 0 ? (
                <p className="text-gray-400 text-center py-4 text-sm">
                  No corrections submitted yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {corrections.map((cr) => (
                    <div key={cr.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-700 capitalize">
                            {cr.fieldName}
                          </span>
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cr.status === "approved"
                              ? "bg-green-100 text-green-700"
                              : cr.status === "rejected"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
                              }`}
                          >
                            {cr.status === "approved" ? "Applied" : cr.status}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">{formatDate(cr.createdAt)}</span>
                      </div>
                      <div className="text-sm space-y-1">
                        <p>
                          <span className="text-gray-500">From:</span>{" "}
                          <span className="line-through text-gray-400">{cr.currentValue}</span>
                        </p>
                        <p>
                          <span className="text-gray-500">To:</span>{" "}
                          <span className="text-gray-900">{cr.requestedValue}</span>
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        Order: {cr.orderId.slice(0, 8)}...
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Link to My Data */}
            <div className="mt-6 text-center">
              <Link href="/my-data" className="text-sm text-green-600 hover:text-green-700">
                Go to My Data for access, export, or deletion &rarr;
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
