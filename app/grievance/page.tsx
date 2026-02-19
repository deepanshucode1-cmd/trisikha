"use client";

import { useState } from "react";
import Link from "next/link";
import { toast, ToastContainer } from "react-toastify";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "react-toastify/dist/ReactToastify.css";

type GrievanceData = {
  id: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  slaDeadline: string;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

type Step = "email" | "otp" | "grievance";

const CATEGORY_LABELS: Record<string, string> = {
  data_processing: "Data Processing",
  correction: "Correction",
  deletion: "Deletion",
  consent: "Consent",
  breach: "Data Breach",
  other: "Other",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-700",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export default function GrievancePage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpExpiry, setOtpExpiry] = useState<Date | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);

  // Grievance form state
  const [category, setCategory] = useState("other");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  // Existing grievances
  const [grievances, setGrievances] = useState<GrievanceData[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

      toast.success(
        "An OTP has been sent to your email. Please check your inbox."
      );
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
      await fetchGrievances(data.sessionToken);
      setStep("grievance");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to verify OTP"
      );
    } finally {
      setLoading(false);
    }
  };

  // Fetch existing grievances
  const fetchGrievances = async (token: string) => {
    try {
      const params = new URLSearchParams({ email, sessionToken: token });
      const res = await fetch(`/api/guest/grievance?${params}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setGrievances(data.grievances || []);
      }
    } catch {
      // Non-critical
    }
  };

  // Submit grievance
  const handleSubmitGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/guest/grievance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          sessionToken,
          subject,
          description,
          category,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit grievance");
      }

      toast.success("Grievance submitted successfully. You will receive a confirmation email.");

      // Reset form
      setSubject("");
      setDescription("");
      setCategory("other");

      // Refresh grievances list
      await fetchGrievances(sessionToken);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to submit grievance"
      );
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

  const getDaysRemaining = (slaDeadline: string) => {
    const deadline = new Date(slaDeadline);
    const now = new Date();
    const diff = deadline.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Grievance Redressal
          </h1>
          <p className="mt-2 text-gray-600">
            File a grievance related to your personal data
          </p>
          <p className="mt-1 text-sm text-gray-500">
            DPDP Rules 2025, Rule 14(3) &mdash; 90-day resolution guarantee
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
              Enter the email address you used to place orders. We&apos;ll send
              you a one-time password to verify your identity.
            </p>

            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
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

            <div className="mt-6 text-center space-y-2">
              <Link
                href="/my-data"
                className="text-sm text-green-600 hover:text-green-700 block"
              >
                Looking for data access or deletion? Go to My Data &rarr;
              </Link>
              <Link
                href="/correct-data"
                className="text-sm text-green-600 hover:text-green-700 block"
              >
                Need to correct order data? Go to Correct Data &rarr;
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
                <label
                  htmlFor="otp"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Verification Code
                </label>
                <input
                  type="text"
                  id="otp"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
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

        {/* Step 3: Grievance Form + History */}
        {step === "grievance" && (
          <>
            {/* SLA Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                Under DPDP Rules 2025 (Rule 14(3)), your grievance will be
                addressed within <strong>90 days</strong> from the date of
                filing. You will receive email updates on the progress of your
                grievance.
              </p>
            </div>

            {/* Submit New Grievance */}
            <div className="bg-white shadow-sm rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Submit New Grievance
              </h3>

              <form onSubmit={handleSubmitGrievance} className="space-y-4">
                <div>
                  <label
                    htmlFor="category"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Category
                  </label>
                  <select
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="data_processing">Data Processing</option>
                    <option value="correction">Correction</option>
                    <option value="deletion">Deletion</option>
                    <option value="consent">Consent</option>
                    <option value="breach">Data Breach</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="subject"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Subject
                  </label>
                  <input
                    type="text"
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    minLength={5}
                    maxLength={200}
                    placeholder="Brief description of your grievance"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    {subject.length}/200 characters
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Description
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    minLength={20}
                    maxLength={2000}
                    rows={5}
                    placeholder="Please provide details about your grievance, including any relevant order numbers or dates..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-vertical"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    {description.length}/2000 characters (minimum 20)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={
                    loading ||
                    subject.length < 5 ||
                    description.length < 20
                  }
                  className="w-full py-3 px-4 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Submitting..." : "Submit Grievance"}
                </button>
              </form>
            </div>

            {/* My Grievances */}
            <div className="bg-white shadow-sm rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                My Grievances ({grievances.length})
              </h3>

              {grievances.length === 0 ? (
                <p className="text-gray-400 text-center py-4 text-sm">
                  No grievances filed yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {grievances.map((g) => {
                    const daysRemaining = getDaysRemaining(g.slaDeadline);
                    const isOverdue = daysRemaining < 0;
                    const isExpanded = expandedId === g.id;

                    return (
                      <div
                        key={g.id}
                        className="border border-gray-200 rounded-lg p-4"
                      >
                        <div
                          className="flex justify-between items-start cursor-pointer"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : g.id)
                          }
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span
                                className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_STYLES[g.status] || "bg-gray-100 text-gray-700"}`}
                              >
                                {STATUS_LABELS[g.status] || g.status}
                              </span>
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">
                                {CATEGORY_LABELS[g.category] || g.category}
                              </span>
                              {isOverdue &&
                                g.status !== "resolved" &&
                                g.status !== "closed" && (
                                  <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                                    Overdue
                                  </span>
                                )}
                            </div>
                            <p className="font-medium text-gray-900 truncate">
                              {g.subject}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              Filed: {formatDate(g.createdAt)}
                            </p>
                          </div>
                          <div className="text-right ml-4 flex-shrink-0">
                            {g.status === "resolved" || g.status === "closed" ? (
                              <p className="text-xs text-green-600">
                                Resolved {g.resolvedAt ? formatDate(g.resolvedAt) : ""}
                              </p>
                            ) : (
                              <p
                                className={`text-xs font-medium ${isOverdue ? "text-red-600" : "text-gray-500"}`}
                              >
                                {isOverdue
                                  ? `${Math.abs(daysRemaining)} days overdue`
                                  : `${daysRemaining} days remaining`}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              SLA: {formatDate(g.slaDeadline)}
                            </p>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">
                              {g.description}
                            </p>
                            {g.resolutionNotes && (
                              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-green-800 mb-1">
                                  Resolution:
                                </p>
                                <p className="text-sm text-green-700">
                                  {g.resolutionNotes}
                                </p>
                              </div>
                            )}
                            <p className="text-xs text-gray-400 mt-2">
                              Reference: {g.id}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Links */}
            <div className="mt-6 text-center space-y-2">
              <Link
                href="/my-data"
                className="text-sm text-green-600 hover:text-green-700 block"
              >
                Go to My Data for access, export, or deletion &rarr;
              </Link>
              <Link
                href="/correct-data"
                className="text-sm text-green-600 hover:text-green-700 block"
              >
                Need to correct order data? Go to Correct Data &rarr;
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
    <Footer />
    </>
  );
}
