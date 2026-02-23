/**
 * Return Inspection Photo Storage Service
 * Handles upload, signed URL generation, and validation of
 * return inspection photos in a private Supabase Storage bucket.
 */

import { createServiceClient } from "@/utils/supabase/service";
import { logError, logSecurityEvent } from "@/lib/logger";
import { v4 as uuidv4 } from "uuid";

const BUCKET = "return-inspection-photos";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PHOTOS = 3;
const MIN_PHOTOS_WHEN_DEDUCTING = 1;

// Magic bytes for file type validation
const MAGIC_BYTES: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
};

function getExtension(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
  };
  return map[contentType] || "bin";
}

/**
 * Validate a single photo file's content type, size, and magic bytes.
 */
export function validatePhoto(
  buffer: Buffer,
  contentType: string
): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    return {
      valid: false,
      error: `Invalid file type: ${contentType}. Allowed: JPEG, PNG.`,
    };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Maximum: 5MB.`,
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
 * Validate photo count based on product condition.
 */
export function validatePhotoCount(
  count: number,
  hasDeduction: boolean
): { valid: boolean; error?: string } {
  if (hasDeduction && count < MIN_PHOTOS_WHEN_DEDUCTING) {
    return {
      valid: false,
      error: `At least ${MIN_PHOTOS_WHEN_DEDUCTING} photo is required when applying a deduction.`,
    };
  }

  if (count > MAX_PHOTOS) {
    return {
      valid: false,
      error: `Maximum ${MAX_PHOTOS} photos allowed.`,
    };
  }

  return { valid: true };
}

/**
 * Upload an inspection photo to the private bucket.
 * Path: {order_id}/{uuid}.{ext}
 */
export async function uploadInspectionPhoto(params: {
  file: Buffer;
  contentType: string;
  orderId: string;
}): Promise<{ path: string }> {
  const supabase = createServiceClient();

  const ext = getExtension(params.contentType);
  const path = `${params.orderId}/${uuidv4()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, params.file, {
      contentType: params.contentType,
      upsert: false,
    });

  if (error) {
    logError(error as Error, {
      context: "upload_inspection_photo_failed",
      orderId: params.orderId,
    });
    throw new Error("Failed to upload inspection photo.");
  }

  logSecurityEvent("inspection_photo_uploaded", {
    orderId: params.orderId,
    path,
    contentType: params.contentType,
    sizeBytes: params.file.length,
  });

  return { path };
}

/**
 * Generate a signed URL for viewing an inspection photo.
 * URL expires in 300 seconds (5 minutes).
 */
export async function getInspectionPhotoUrl(
  photoPath: string
): Promise<{ signedUrl: string }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(photoPath, 300);

  if (error || !data?.signedUrl) {
    logError((error as Error) || new Error("No signed URL returned"), {
      context: "get_inspection_photo_url_failed",
      photoPath,
    });
    throw new Error("Failed to generate photo URL.");
  }

  return { signedUrl: data.signedUrl };
}
