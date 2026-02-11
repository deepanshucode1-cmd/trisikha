import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { z } from "zod";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/logger";
import { sanitizeObject } from "@/lib/xss";
import { findActiveNomination, submitNomineeClaim } from "@/lib/nominee";
import {
  validateDocument,
  uploadClaimDocument,
} from "@/lib/nominee-storage";
import { sendNomineeClaimReceived } from "@/lib/email";

const claimFieldsSchema = z.object({
  nomineeEmail: z.email({ message: "Invalid nominee email" }),
  sessionToken: z.string().min(1, "Session token required"),
  principalEmail: z.email({ message: "Invalid principal email" }),
  claimType: z.enum(["death", "incapacity"], {
    message: "Claim type must be 'death' or 'incapacity'",
  }),
  actionExport: z
    .string()
    .transform((v) => v === "true")
    .optional()
    .default(false),
  actionDeletion: z
    .string()
    .transform((v) => v === "true")
    .optional()
    .default(false),
});

/**
 * POST /api/guest/nominee-claim
 *
 * Submit a nominee claim with proof document upload.
 * Requires nominee OTP session token.
 * Content-Type: multipart/form-data
 * DPDP Rule 14
 */
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = await apiRateLimit.limit(`nominee-claim:${ip}`);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Parse multipart form data
    const formData = await req.formData();

    const fields: Record<string, string> = {};
    let documentFile: File | null = null;

    for (const [key, value] of formData.entries()) {
      if (key === "document" && value instanceof File) {
        documentFile = value;
      } else {
        fields[key] = value.toString();
      }
    }

    // Validate text fields
    const parseResult = claimFieldsSchema.safeParse(fields);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const sanitizedData = sanitizeObject(parseResult.data);
    const {
      nomineeEmail,
      sessionToken,
      principalEmail,
      claimType,
      actionExport,
      actionDeletion,
    } = sanitizedData;

    // At least one action must be requested
    if (!actionExport && !actionDeletion) {
      return NextResponse.json(
        {
          error:
            "At least one action (export or deletion) must be requested.",
        },
        { status: 400 }
      );
    }

    const normalizedNomineeEmail = nomineeEmail.toLowerCase().trim();
    const normalizedPrincipalEmail = principalEmail.toLowerCase().trim();

    const supabase = createServiceClient();

    // Verify nominee's OTP session
    const { data: session, error: sessionError } = await supabase
      .from("guest_data_sessions")
      .select("id, session_token, session_expires_at")
      .eq("email", normalizedNomineeEmail)
      .eq("session_token", sessionToken)
      .single();

    if (sessionError || !session) {
      logSecurityEvent("nominee_claim_invalid_session", {
        nomineeEmail: normalizedNomineeEmail,
        ip,
      });
      return NextResponse.json(
        {
          error:
            "Invalid or expired session. Please verify your email again.",
        },
        { status: 401 }
      );
    }

    if (new Date(session.session_expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Session has expired. Please verify your email again." },
        { status: 401 }
      );
    }

    // Verify active nomination exists
    const nomination = await findActiveNomination(
      normalizedPrincipalEmail,
      normalizedNomineeEmail
    );

    if (!nomination) {
      return NextResponse.json(
        { error: "No active nomination found for this email pair." },
        { status: 404 }
      );
    }

    // Validate document
    if (!documentFile) {
      return NextResponse.json(
        { error: "Proof document is required." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await documentFile.arrayBuffer());
    const contentType = documentFile.type;

    const validation = validateDocument(buffer, contentType);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Generate a temporary claim ID for the storage path
    const tempClaimId = crypto.randomUUID();

    // Upload document
    const { path: documentPath } = await uploadClaimDocument({
      file: buffer,
      filename: documentFile.name,
      contentType,
      principalEmail: normalizedPrincipalEmail,
      claimId: tempClaimId,
    });

    // Submit the claim
    const userAgent = req.headers.get("user-agent") || undefined;
    const { claimId } = await submitNomineeClaim({
      nomineeId: nomination.id,
      principalEmail: normalizedPrincipalEmail,
      nomineeEmail: normalizedNomineeEmail,
      claimType,
      documentPath,
      documentFilename: documentFile.name,
      documentContentType: contentType,
      actionExport,
      actionDeletion,
      ip,
      userAgent,
    });

    // Send confirmation email (non-blocking)
    sendNomineeClaimReceived({
      nomineeEmail: normalizedNomineeEmail,
      nomineeName: nomination.nominee_name,
      claimId,
      principalEmail: normalizedPrincipalEmail,
    }).catch((err) =>
      console.error("Failed to send nominee claim received email:", err)
    );

    return NextResponse.json({
      success: true,
      claimId,
      message:
        "Claim submitted. You will be contacted at your email once reviewed.",
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/guest/nominee-claim",
    });
  }
}
