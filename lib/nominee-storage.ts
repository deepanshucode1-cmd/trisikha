/**
 * Nominee Document Storage Service
 * Handles upload, signed URL generation, and deletion of
 * nominee claim proof documents in a private Supabase Storage bucket.
 */

import { createServiceClient } from "@/utils/supabase/service";
import { logError, logSecurityEvent } from "@/lib/logger";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

const BUCKET = "nominee-documents";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Magic bytes for file type validation
const MAGIC_BYTES: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
};

function getExtension(contentType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
  };
  return map[contentType] || "bin";
}

/**
 * Validate file content type and magic bytes.
 */
export function validateDocument(
  buffer: Buffer,
  contentType: string
): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    return {
      valid: false,
      error: `Invalid file type: ${contentType}. Allowed: PDF, JPEG, PNG.`,
    };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Maximum: 10MB.`,
    };
  }

  if (buffer.length < 4) {
    return { valid: false, error: "File is too small to be valid." };
  }

  // Check magic bytes
  const expectedPatterns = MAGIC_BYTES[contentType];
  if (expectedPatterns) {
    const matches = expectedPatterns.some((pattern) =>
      pattern.every((byte, i) => buffer[i] === byte)
    );
    if (!matches) {
      return {
        valid: false,
        error: "File content does not match its declared type.",
      };
    }
  }

  return { valid: true };
}

/**
 * Upload a claim document to the private nominee-documents bucket.
 * Documents are stored under a hashed principal email prefix for isolation.
 */
export async function uploadClaimDocument(params: {
  file: Buffer;
  filename: string;
  contentType: string;
  principalEmail: string;
  claimId: string;
}): Promise<{ path: string }> {
  const supabase = createServiceClient();

  // Hash principal email for path isolation
  const emailHash = crypto
    .createHash("sha256")
    .update(params.principalEmail.toLowerCase().trim())
    .digest("hex")
    .slice(0, 16);

  const ext = getExtension(params.contentType);
  const path = `${emailHash}/${params.claimId}/${uuidv4()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, params.file, {
      contentType: params.contentType,
      upsert: false,
    });

  if (error) {
    logError(error as Error, {
      context: "upload_claim_document_failed",
      claimId: params.claimId,
    });
    throw new Error("Failed to upload document.");
  }

  logSecurityEvent("nominee_document_uploaded", {
    claimId: params.claimId,
    path,
    contentType: params.contentType,
    sizeBytes: params.file.length,
  });

  return { path };
}

/**
 * Generate a signed URL for admin document download.
 * URL expires in 60 seconds.
 */
export async function getClaimDocumentUrl(
  documentPath: string
): Promise<{ signedUrl: string }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(documentPath, 60);

  if (error || !data?.signedUrl) {
    logError((error as Error) || new Error("No signed URL returned"), {
      context: "get_claim_document_url_failed",
      documentPath,
    });
    throw new Error("Failed to generate document URL.");
  }

  return { signedUrl: data.signedUrl };
}

/**
 * Delete a document from storage (for retention cleanup).
 */
export async function deleteClaimDocument(
  documentPath: string
): Promise<{ success: boolean }> {
  const supabase = createServiceClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([documentPath]);

  if (error) {
    logError(error as Error, {
      context: "delete_claim_document_failed",
      documentPath,
    });
    return { success: false };
  }

  logSecurityEvent("nominee_document_deleted", { documentPath });

  return { success: true };
}
