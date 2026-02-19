"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { toast, ToastContainer } from "react-toastify";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "react-toastify/dist/ReactToastify.css";

type Step = "email" | "otp" | "claim";

export default function NomineeClaimPage() {
  const [step, setStep] = useState<Step>("email");
  const [nomineeEmail, setNomineeEmail] = useState("");
  const [principalEmail, setPrincipalEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);

  // Claim form state
  const [claimType, setClaimType] = useState<"death" | "incapacity">("death");
  const [actionExport, setActionExport] = useState(true);
  const [actionDeletion, setActionDeletion] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Success state
  const [claimId, setClaimId] = useState<string | null>(null);

  // Send OTP to nominee
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/guest/nominee-claim/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomineeEmail, principalEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send OTP");
      }

      toast.success(
        "If a valid nomination exists, an OTP has been sent to your email."
      );
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
        body: JSON.stringify({ email: nomineeEmail, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.attemptsRemaining !== undefined) {
          setAttemptsRemaining(data.attemptsRemaining);
        }
        throw new Error(data.error || "Invalid OTP");
      }

      setSessionToken(data.sessionToken);
      setStep("claim");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;

    if (file) {
      const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
      ];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Invalid file type. Please upload a PDF, JPEG, or PNG.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File too large. Maximum size is 10MB.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    setDocumentFile(file);
  };

  // Submit claim
  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!actionExport && !actionDeletion) {
      toast.error("Please select at least one action (export or deletion).");
      return;
    }

    if (!documentFile) {
      toast.error("Please upload a proof document.");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("nomineeEmail", nomineeEmail);
      formData.append("sessionToken", sessionToken);
      formData.append("principalEmail", principalEmail);
      formData.append("claimType", claimType);
      formData.append("actionExport", actionExport.toString());
      formData.append("actionDeletion", actionDeletion.toString());
      formData.append("document", documentFile);

      const res = await fetch("/api/guest/nominee-claim", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit claim");
      }

      setClaimId(data.claimId);
      toast.success("Claim submitted successfully!");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to submit claim"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gray-50 py-8 px-4">
      <ToastContainer position="top-center" autoClose={5000} />

      <div className="max-w-xl mx-auto">


        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Nominee Claim
        </h1>
        <p className="text-gray-600 mb-6">
          If you have been appointed as a data nominee, you can submit a claim
          to request export or deletion of the data principal&apos;s data in the
          event of their death or incapacity.{" "}
          <span className="text-sm text-gray-500">
            DPDP Act 2023, Rule 14
          </span>
        </p>

        {/* Success state */}
        {claimId && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-green-800 mb-2">
              Claim Submitted
            </h2>
            <p className="text-green-700 mb-2">
              Your nominee claim has been submitted and is under review.
            </p>
            <div className="bg-white rounded-md p-3 border border-green-200">
              <p className="text-sm">
                <span className="font-medium">Claim ID:</span> {claimId}
              </p>
            </div>
            <p className="text-sm text-green-600 mt-3">
              You will be notified at <strong>{nomineeEmail}</strong> once your
              claim is reviewed. If you have questions, contact our Grievance
              Officer at{" "}
              <a
                href="mailto:trishikhaorganic@gmail.com"
                className="underline"
              >
                trishikhaorganic@gmail.com
              </a>{" "}
              or +91 79841 30253.
            </p>
          </div>
        )}

        {/* Step 1: Email */}
        {!claimId && step === "email" && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Verify Your Identity
            </h2>
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Email (Nominee)
                </label>
                <input
                  type="email"
                  value={nomineeEmail}
                  onChange={(e) => setNomineeEmail(e.target.value)}
                  placeholder="Your email address"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#3d3c30] focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Principal&apos;s Email
                </label>
                <input
                  type="email"
                  value={principalEmail}
                  onChange={(e) => setPrincipalEmail(e.target.value)}
                  placeholder="Email of the person who appointed you"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#3d3c30] focus:border-transparent outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !nomineeEmail || !principalEmail}
                className="w-full bg-[#3d3c30] text-white py-2.5 rounded-md font-medium hover:bg-[#2d2c22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Sending..." : "Send OTP"}
              </button>
            </form>
          </div>
        )}

        {/* Step 2: OTP */}
        {!claimId && step === "otp" && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Enter OTP
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              If a valid nomination exists, a 6-digit OTP was sent to{" "}
              <strong>{nomineeEmail}</strong>
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
              Go back
            </button>
          </div>
        )}

        {/* Step 3: Claim Form */}
        {!claimId && step === "claim" && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Submit Your Claim
            </h2>

            <form onSubmit={handleSubmitClaim} className="space-y-5">
              {/* Claim Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Claim Type
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="claimType"
                      value="death"
                      checked={claimType === "death"}
                      onChange={() => setClaimType("death")}
                      className="text-[#3d3c30]"
                    />
                    <div>
                      <span className="font-medium">Death</span>
                      <p className="text-xs text-gray-500">
                        The data principal has passed away
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="claimType"
                      value="incapacity"
                      checked={claimType === "incapacity"}
                      onChange={() => setClaimType("incapacity")}
                      className="text-[#3d3c30]"
                    />
                    <div>
                      <span className="font-medium">Incapacity</span>
                      <p className="text-xs text-gray-500">
                        The data principal is unable to manage their affairs
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Actions Requested */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Actions Requested
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Select at least one action
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={actionExport}
                      onChange={(e) => setActionExport(e.target.checked)}
                      className="text-[#3d3c30] rounded"
                    />
                    <div>
                      <span className="font-medium">Export Data</span>
                      <p className="text-xs text-gray-500">
                        Request a copy of all order data
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={actionDeletion}
                      onChange={(e) => setActionDeletion(e.target.checked)}
                      className="text-[#3d3c30] rounded"
                    />
                    <div>
                      <span className="font-medium">Delete Data</span>
                      <p className="text-xs text-gray-500">
                        Request deletion of all personal data
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Document Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Proof Document
                </label>
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mb-2">
                  <p className="text-xs text-gray-600">
                    {claimType === "death" ? (
                      <>Please upload a <strong>death certificate</strong>.</>
                    ) : (
                      <>
                        Please upload a{" "}
                        <strong>
                          medical certificate from a registered medical
                          practitioner
                        </strong>
                        , or a{" "}
                        <strong>
                          court order appointing legal guardianship
                        </strong>
                        .
                      </>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Accepted formats: PDF, JPEG, PNG. Maximum size: 10MB.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[#3d3c30] file:text-white hover:file:bg-[#2d2c22] file:cursor-pointer"
                />
                {documentFile && (
                  <p className="text-xs text-green-600 mt-1">
                    Selected: {documentFile.name} (
                    {(documentFile.size / 1024 / 1024).toFixed(1)}MB)
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={
                  loading ||
                  (!actionExport && !actionDeletion) ||
                  !documentFile
                }
                className="w-full bg-[#3d3c30] text-white py-2.5 rounded-md font-medium hover:bg-[#2d2c22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Submitting..." : "Submit Claim"}
              </button>
            </form>
          </div>
        )}

        {/* Info box (always visible when not in success state) */}
        {!claimId && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">
              About Nominee Claims
            </h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>
                You must have been appointed as a nominee by the data principal
              </li>
              <li>
                Claims require proof of death (death certificate) or incapacity
                (medical certificate or court order)
              </li>
              <li>
                Our team will review your claim and notify you by email
              </li>
              <li>
                For questions, contact our Grievance Officer at{" "}
                <a
                  href="mailto:trishikhaorganic@gmail.com"
                  className="underline"
                >
                  trishikhaorganic@gmail.com
                </a>
              </li>
              <li>
                <Link
                  href="/nominee"
                  className="underline hover:text-blue-900"
                >
                  Appoint a Nominee
                </Link>
                {" | "}
                <Link
                  href="/privacy-policy"
                  className="underline hover:text-blue-900"
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
    <Footer />
    </>
  );
}
