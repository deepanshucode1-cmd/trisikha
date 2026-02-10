"use client";

import { useState } from "react";
import Link from "next/link";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type NomineeData = {
  id: string;
  nomineeName: string;
  nomineeEmail: string;
  relationship: string;
  createdAt: string;
};

type Step = "email" | "otp" | "nominee";

const RELATIONSHIP_LABELS: Record<string, string> = {
  spouse: "Spouse",
  child: "Child",
  parent: "Parent",
  sibling: "Sibling",
  legal_guardian: "Legal Guardian",
  other: "Other",
};

export default function NomineePage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);

  // Nominee data (fetched after OTP verification)
  const [nominee, setNominee] = useState<NomineeData | null>(null);

  // Appointment form state
  const [nomineeName, setNomineeName] = useState("");
  const [nomineeEmail, setNomineeEmail] = useState("");
  const [relationship, setRelationship] = useState("spouse");

  // Nominee OTP state
  const [nomineeOtpSent, setNomineeOtpSent] = useState(false);
  const [nomineeOtp, setNomineeOtp] = useState("");

  // Revoke confirmation
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  // Send OTP to principal
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

      toast.success("An OTP has been sent to your email.");
      setStep("otp");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  // Verify principal OTP
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
      await fetchNominee(data.sessionToken);
      setStep("nominee");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  // Fetch current nominee
  const fetchNominee = async (token: string) => {
    try {
      const res = await fetch(
        `/api/guest/nominee?email=${encodeURIComponent(email)}&sessionToken=${encodeURIComponent(token)}`
      );
      const data = await res.json();

      if (res.ok && data.nominee) {
        setNominee(data.nominee);
      } else {
        setNominee(null);
      }
    } catch {
      setNominee(null);
    }
  };

  // Send OTP to nominee email
  const handleSendNomineeOtp = async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/guest/nominee/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          sessionToken,
          nomineeEmail,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send OTP to nominee");
      }

      toast.success("OTP sent to nominee email. Please enter it below.");
      setNomineeOtpSent(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send OTP to nominee"
      );
    } finally {
      setLoading(false);
    }
  };

  // Appoint nominee
  const handleAppoint = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/guest/nominee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          sessionToken,
          nomineeEmail,
          nomineeOtp,
          nomineeName,
          relationship,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.attemptsRemaining !== undefined) {
          setAttemptsRemaining(data.attemptsRemaining);
        }
        throw new Error(data.error || "Failed to appoint nominee");
      }

      toast.success("Nominee appointed successfully!");
      setNomineeName("");
      setNomineeEmail("");
      setNomineeOtp("");
      setNomineeOtpSent(false);
      await fetchNominee(sessionToken);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to appoint nominee"
      );
    } finally {
      setLoading(false);
    }
  };

  // Revoke nominee
  const handleRevoke = async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/guest/nominee", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sessionToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to revoke nominee");
      }

      toast.success("Nominee revoked successfully.");
      setNominee(null);
      setShowRevokeConfirm(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke nominee"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <ToastContainer position="top-center" autoClose={5000} />

      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <Link
            href="/my-data"
            className="text-sm text-[#3d3c30] hover:underline"
          >
            &larr; Back to My Data
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Nominee Appointment
        </h1>
        <p className="text-gray-600 mb-6">
          Appoint a nominee who can exercise your data rights (export or
          deletion) in the event of your death or incapacity.{" "}
          <span className="text-sm text-gray-500">
            DPDP Act 2023, Rule 14
          </span>
        </p>

        {/* Step 1: Email */}
        {step === "email" && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Verify Your Identity
            </h2>
            <form onSubmit={handleSendOtp}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter the email used for your orders"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#3d3c30] focus:border-transparent outline-none"
              />
              <button
                type="submit"
                disabled={loading || !email}
                className="mt-4 w-full bg-[#3d3c30] text-white py-2.5 rounded-md font-medium hover:bg-[#2d2c22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Sending..." : "Send OTP"}
              </button>
            </form>
          </div>
        )}

        {/* Step 2: OTP */}
        {step === "otp" && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Enter OTP
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              We sent a 6-digit OTP to <strong>{email}</strong>
            </p>
            <form onSubmit={handleVerifyOtp}>
              <input
                type="text"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                maxLength={6}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-md text-center text-2xl tracking-widest focus:ring-2 focus:ring-[#3d3c30] focus:border-transparent outline-none"
              />
              {attemptsRemaining < 5 && (
                <p className="text-sm text-red-600 mt-2">
                  {attemptsRemaining} attempt(s) remaining
                </p>
              )}
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="mt-4 w-full bg-[#3d3c30] text-white py-2.5 rounded-md font-medium hover:bg-[#2d2c22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>
            </form>
            <button
              onClick={() => {
                setStep("email");
                setOtp("");
              }}
              className="mt-3 w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Use a different email
            </button>
          </div>
        )}

        {/* Step 3: Nominee Management */}
        {step === "nominee" && (
          <>
            {/* Current nominee */}
            {nominee ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Your Current Nominee
                </h2>
                <div className="bg-green-50 border border-green-200 rounded-md p-4 space-y-2">
                  <p>
                    <span className="font-medium text-gray-700">Name:</span>{" "}
                    {nominee.nomineeName}
                  </p>
                  <p>
                    <span className="font-medium text-gray-700">Email:</span>{" "}
                    {nominee.nomineeEmail}
                  </p>
                  <p>
                    <span className="font-medium text-gray-700">
                      Relationship:
                    </span>{" "}
                    {RELATIONSHIP_LABELS[nominee.relationship] ||
                      nominee.relationship}
                  </p>
                  <p>
                    <span className="font-medium text-gray-700">
                      Appointed:
                    </span>{" "}
                    {new Date(nominee.createdAt).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>

                {!showRevokeConfirm ? (
                  <button
                    onClick={() => setShowRevokeConfirm(true)}
                    className="mt-4 w-full bg-red-600 text-white py-2.5 rounded-md font-medium hover:bg-red-700 transition-colors"
                  >
                    Revoke Nominee
                  </button>
                ) : (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
                    <p className="text-sm text-red-800 mb-3">
                      Are you sure you want to revoke{" "}
                      <strong>{nominee.nomineeName}</strong> as your nominee?
                      They will no longer be able to exercise data rights on
                      your behalf.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={handleRevoke}
                        disabled={loading}
                        className="flex-1 bg-red-600 text-white py-2 rounded-md font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {loading ? "Revoking..." : "Yes, Revoke"}
                      </button>
                      <button
                        onClick={() => setShowRevokeConfirm(false)}
                        className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-md font-medium hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Appointment form */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  Appoint a Nominee
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  A nominee can request export or deletion of your data in the
                  event of your death or incapacity. An OTP will be sent to the
                  nominee&apos;s email for verification.
                </p>

                <form onSubmit={handleAppoint} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nominee Name
                    </label>
                    <input
                      type="text"
                      value={nomineeName}
                      onChange={(e) => setNomineeName(e.target.value)}
                      placeholder="Full name"
                      required
                      maxLength={100}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#3d3c30] focus:border-transparent outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nominee Email
                    </label>
                    <input
                      type="email"
                      value={nomineeEmail}
                      onChange={(e) => setNomineeEmail(e.target.value)}
                      placeholder="nominee@example.com"
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#3d3c30] focus:border-transparent outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Relationship
                    </label>
                    <select
                      value={relationship}
                      onChange={(e) => setRelationship(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#3d3c30] focus:border-transparent outline-none"
                    >
                      {Object.entries(RELATIONSHIP_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {!nomineeOtpSent ? (
                    <button
                      type="button"
                      onClick={handleSendNomineeOtp}
                      disabled={loading || !nomineeName || !nomineeEmail}
                      className="w-full bg-[#3d3c30] text-white py-2.5 rounded-md font-medium hover:bg-[#2d2c22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {loading ? "Sending..." : "Send OTP to Nominee"}
                    </button>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nominee OTP
                        </label>
                        <p className="text-xs text-gray-500 mb-2">
                          Enter the 6-digit OTP sent to{" "}
                          <strong>{nomineeEmail}</strong>. The nominee needs to
                          share this code with you.
                        </p>
                        <input
                          type="text"
                          value={nomineeOtp}
                          onChange={(e) =>
                            setNomineeOtp(
                              e.target.value.replace(/\D/g, "").slice(0, 6)
                            )
                          }
                          placeholder="000000"
                          maxLength={6}
                          required
                          className="w-full px-4 py-3 border border-gray-300 rounded-md text-center text-2xl tracking-widest focus:ring-2 focus:ring-[#3d3c30] focus:border-transparent outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading || nomineeOtp.length !== 6}
                        className="w-full bg-green-600 text-white py-2.5 rounded-md font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {loading ? "Appointing..." : "Confirm Appointment"}
                      </button>
                    </>
                  )}
                </form>
              </div>
            )}

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">
                About Nominee Appointment
              </h3>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>You can have one active nominee at a time</li>
                <li>
                  Your nominee can only act after providing proof of your death
                  or incapacity
                </li>
                <li>
                  Actions are limited to data export and deletion — processed
                  by our admin team
                </li>
                <li>You can revoke and re-appoint a nominee at any time</li>
                <li>
                  <Link
                    href="/privacy-policy"
                    className="underline hover:text-blue-900"
                  >
                    Privacy Policy
                  </Link>
                  {" | "}
                  <Link
                    href="/nominee-claim"
                    className="underline hover:text-blue-900"
                  >
                    Submit a Nominee Claim
                  </Link>
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
