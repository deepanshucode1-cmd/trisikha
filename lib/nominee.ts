/**
 * Nominee Appointment Service
 * DPDP Rules 2025, Rule 14 — Right to Nominate
 *
 * Flow:
 * 1. OTP-verified principal appoints a nominee (nominee email also OTP-verified)
 * 2. Nominee can submit a claim (death/incapacity) with proof document
 * 3. Admin verifies claim documents and executes export/deletion on behalf
 * 4. All actions are audit-logged for compliance
 */

import { createServiceClient } from "@/utils/supabase/service";
import { logError, logSecurityEvent } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";

// Types
export type NomineeStatus = "active" | "revoked";
export type ClaimType = "death" | "incapacity";
export type ClaimStatus = "pending" | "verified" | "rejected" | "completed";
export type Relationship =
  | "spouse"
  | "child"
  | "parent"
  | "sibling"
  | "legal_guardian"
  | "other";

export interface Nominee {
  id: string;
  principal_email: string;
  nominee_name: string;
  nominee_email: string;
  relationship: Relationship;
  nominee_email_verified: boolean;
  status: NomineeStatus;
  revoked_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface NomineeClaim {
  id: string;
  nominee_id: string;
  principal_email: string;
  nominee_email: string;
  claim_type: ClaimType;
  document_path: string;
  document_filename: string;
  document_content_type: string;
  action_export: boolean;
  action_deletion: boolean;
  status: ClaimStatus;
  admin_notes: string | null;
  processed_by: string | null;
  processed_at: string | null;
  document_retained_until: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  // Joined from nominees table (optional, for admin views)
  nominee?: Nominee;
}

export interface AppointNomineeParams {
  principalEmail: string;
  nomineeName: string;
  nomineeEmail: string;
  relationship: Relationship;
  ip: string;
  userAgent?: string;
}

export interface SubmitClaimParams {
  nomineeId: string;
  principalEmail: string;
  nomineeEmail: string;
  claimType: ClaimType;
  documentPath: string;
  documentFilename: string;
  documentContentType: string;
  actionExport: boolean;
  actionDeletion: boolean;
  ip: string;
  userAgent?: string;
}

export interface ProcessClaimParams {
  claimId: string;
  action: "verify" | "reject" | "complete";
  adminId: string;
  adminNotes?: string;
}

// ============================================================
// Appointment functions
// ============================================================

/**
 * Appoint a nominee for a data principal.
 * Only one active nominee per principal is allowed.
 */
export async function appointNominee(
  params: AppointNomineeParams
): Promise<{ nomineeId: string }> {
  const supabase = createServiceClient();
  const normalizedPrincipalEmail = params.principalEmail.toLowerCase().trim();
  const normalizedNomineeEmail = params.nomineeEmail.toLowerCase().trim();

  if (normalizedPrincipalEmail === normalizedNomineeEmail) {
    throw new Error("Nominee email must be different from your email.");
  }

  // Check for existing active nominee
  const { data: existing } = await supabase
    .from("nominees")
    .select("id")
    .eq("principal_email", normalizedPrincipalEmail)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    throw new Error(
      "You already have an active nominee. Please revoke the current nominee before appointing a new one."
    );
  }

  const { data, error } = await supabase
    .from("nominees")
    .insert({
      principal_email: normalizedPrincipalEmail,
      nominee_name: params.nomineeName,
      nominee_email: normalizedNomineeEmail,
      relationship: params.relationship,
      nominee_email_verified: true,
      status: "active",
      ip_address: params.ip,
      user_agent: params.userAgent || null,
    })
    .select("id")
    .single();

  if (error) {
    logError(error as Error, {
      context: "appoint_nominee_failed",
      email: normalizedPrincipalEmail,
    });
    throw new Error("Failed to appoint nominee.");
  }

  await logDataAccess({
    tableName: "nominees",
    operation: "INSERT",
    userRole: "guest",
    ip: params.ip,
    newData: {
      principal_email: normalizedPrincipalEmail,
      nominee_email: normalizedNomineeEmail,
      relationship: params.relationship,
    },
    endpoint: "/api/guest/nominee",
    reason: `DPDP Rule 14 — nominee appointed by ${normalizedPrincipalEmail}`,
  });

  logSecurityEvent("nominee_appointed", {
    nomineeId: data.id,
    principalEmail: normalizedPrincipalEmail,
    nomineeEmail: normalizedNomineeEmail,
    relationship: params.relationship,
    ip: params.ip,
  });

  return { nomineeId: data.id };
}

/**
 * Get the active nominee for a principal email.
 * Returns null if no active nominee exists.
 */
export async function getNomineeByPrincipal(
  principalEmail: string
): Promise<Nominee | null> {
  const supabase = createServiceClient();
  const normalizedEmail = principalEmail.toLowerCase().trim();

  const { data, error } = await supabase
    .from("nominees")
    .select("*")
    .eq("principal_email", normalizedEmail)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    logError(error as Error, {
      context: "get_nominee_by_principal_failed",
      email: normalizedEmail,
    });
    return null;
  }

  return data as Nominee | null;
}

/**
 * Revoke the active nominee for a principal email.
 */
export async function revokeNominee(
  principalEmail: string,
  ip: string
): Promise<{ success: boolean; message: string; nominee?: Nominee }> {
  const supabase = createServiceClient();
  const normalizedEmail = principalEmail.toLowerCase().trim();
  const now = new Date().toISOString();

  // Find active nominee
  const { data: nominee, error: fetchError } = await supabase
    .from("nominees")
    .select("*")
    .eq("principal_email", normalizedEmail)
    .eq("status", "active")
    .maybeSingle();

  if (fetchError || !nominee) {
    return { success: false, message: "No active nominee found." };
  }

  const { error: updateError } = await supabase
    .from("nominees")
    .update({
      status: "revoked",
      revoked_at: now,
      updated_at: now,
    })
    .eq("id", nominee.id);

  if (updateError) {
    logError(updateError as Error, {
      context: "revoke_nominee_failed",
      email: normalizedEmail,
    });
    return { success: false, message: "Failed to revoke nominee." };
  }

  await logDataAccess({
    tableName: "nominees",
    operation: "UPDATE",
    userRole: "guest",
    ip,
    oldData: { status: "active" },
    newData: { status: "revoked", revoked_at: now },
    endpoint: "/api/guest/nominee",
    reason: `DPDP Rule 14 — nominee revoked by ${normalizedEmail}`,
  });

  logSecurityEvent("nominee_revoked", {
    nomineeId: nominee.id,
    principalEmail: normalizedEmail,
    nomineeEmail: (nominee as Nominee).nominee_email,
    ip,
  });

  return {
    success: true,
    message: "Nominee revoked successfully.",
    nominee: nominee as Nominee,
  };
}

// ============================================================
// Claim functions
// ============================================================

/**
 * Find an active nominee record for a (principalEmail, nomineeEmail) pair.
 * Used to verify a nomination exists before allowing a claim.
 */
export async function findActiveNomination(
  principalEmail: string,
  nomineeEmail: string
): Promise<Nominee | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("nominees")
    .select("*")
    .eq("principal_email", principalEmail.toLowerCase().trim())
    .eq("nominee_email", nomineeEmail.toLowerCase().trim())
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    logError(error as Error, {
      context: "find_active_nomination_failed",
    });
    return null;
  }

  return data as Nominee | null;
}

/**
 * Submit a nominee claim with a proof document.
 * Document must already be uploaded to storage.
 */
export async function submitNomineeClaim(
  params: SubmitClaimParams
): Promise<{ claimId: string }> {
  const supabase = createServiceClient();

  // Document retention: 1 year after creation
  const retainUntil = new Date();
  retainUntil.setFullYear(retainUntil.getFullYear() + 1);

  const { data, error } = await supabase
    .from("nominee_claims")
    .insert({
      nominee_id: params.nomineeId,
      principal_email: params.principalEmail.toLowerCase().trim(),
      nominee_email: params.nomineeEmail.toLowerCase().trim(),
      claim_type: params.claimType,
      document_path: params.documentPath,
      document_filename: params.documentFilename,
      document_content_type: params.documentContentType,
      action_export: params.actionExport,
      action_deletion: params.actionDeletion,
      status: "pending",
      document_retained_until: retainUntil.toISOString(),
      ip_address: params.ip,
      user_agent: params.userAgent || null,
    })
    .select("id")
    .single();

  if (error) {
    logError(error as Error, {
      context: "submit_nominee_claim_failed",
      nomineeEmail: params.nomineeEmail,
    });
    throw new Error("Failed to submit nominee claim.");
  }

  await logDataAccess({
    tableName: "nominee_claims",
    operation: "INSERT",
    userRole: "guest",
    ip: params.ip,
    newData: {
      nominee_id: params.nomineeId,
      principal_email: params.principalEmail,
      claim_type: params.claimType,
      action_export: params.actionExport,
      action_deletion: params.actionDeletion,
    },
    endpoint: "/api/guest/nominee-claim",
    reason: `DPDP Rule 14 — nominee claim submitted by ${params.nomineeEmail}`,
  });

  logSecurityEvent("nominee_claim_submitted", {
    claimId: data.id,
    nomineeId: params.nomineeId,
    principalEmail: params.principalEmail,
    nomineeEmail: params.nomineeEmail,
    claimType: params.claimType,
    ip: params.ip,
  });

  return { claimId: data.id };
}

/**
 * Get nominee claims with optional filters (admin use).
 */
export async function getNomineeClaims(params?: {
  status?: ClaimStatus;
  email?: string;
  limit?: number;
  offset?: number;
}): Promise<{ claims: NomineeClaim[]; total: number }> {
  const supabase = createServiceClient();

  let query = supabase
    .from("nominee_claims")
    .select("*, nominee:nominees(*)", { count: "exact" });

  if (params?.status) {
    query = query.eq("status", params.status);
  }

  if (params?.email) {
    query = query.or(
      `principal_email.ilike.%${params.email}%,nominee_email.ilike.%${params.email}%`
    );
  }

  query = query.order("created_at", { ascending: false });

  const limit = params?.limit || 20;
  const offset = params?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    logError(error as Error, { context: "get_nominee_claims_failed" });
    return { claims: [], total: 0 };
  }

  return {
    claims: (data as NomineeClaim[]) || [],
    total: count || 0,
  };
}

/**
 * Get a single nominee claim by ID with joined nominee data (admin use).
 */
export async function getNomineeClaimById(
  claimId: string
): Promise<NomineeClaim | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("nominee_claims")
    .select("*, nominee:nominees(*)")
    .eq("id", claimId)
    .single();

  if (error) {
    logError(error as Error, {
      context: "get_nominee_claim_by_id_failed",
      claimId,
    });
    return null;
  }

  return data as NomineeClaim;
}

/**
 * Process a nominee claim (admin action).
 * Status transitions: pending → verified | rejected, verified → completed.
 */
export async function processNomineeClaim(
  params: ProcessClaimParams
): Promise<{ success: boolean; message: string }> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: claim, error: fetchError } = await supabase
    .from("nominee_claims")
    .select("*")
    .eq("id", params.claimId)
    .single();

  if (fetchError || !claim) {
    return { success: false, message: "Nominee claim not found." };
  }

  const typedClaim = claim as NomineeClaim;

  // Validate status transition
  const validTransitions: Record<string, string[]> = {
    pending: ["verify", "reject"],
    verified: ["complete"],
  };

  const allowed = validTransitions[typedClaim.status] || [];
  if (!allowed.includes(params.action)) {
    return {
      success: false,
      message: `Cannot ${params.action} a claim with status '${typedClaim.status}'.`,
    };
  }

  const newStatus =
    params.action === "verify"
      ? "verified"
      : params.action === "reject"
        ? "rejected"
        : "completed";

  const { error: updateError } = await supabase
    .from("nominee_claims")
    .update({
      status: newStatus,
      admin_notes: params.adminNotes || typedClaim.admin_notes,
      processed_by: params.adminId,
      processed_at: now,
      updated_at: now,
    })
    .eq("id", params.claimId);

  if (updateError) {
    logError(updateError as Error, {
      context: "process_nominee_claim_failed",
      claimId: params.claimId,
    });
    return { success: false, message: "Failed to process nominee claim." };
  }

  await logDataAccess({
    tableName: "nominee_claims",
    operation: "UPDATE",
    userId: params.adminId,
    userRole: "admin",
    oldData: { status: typedClaim.status },
    newData: { status: newStatus, admin_notes: params.adminNotes },
    endpoint: `/api/admin/nominee-claims/${params.claimId}`,
    reason: `Admin ${params.action} nominee claim for ${typedClaim.principal_email}`,
  });

  logSecurityEvent("nominee_claim_processed", {
    claimId: params.claimId,
    action: params.action,
    newStatus,
    principalEmail: typedClaim.principal_email,
    nomineeEmail: typedClaim.nominee_email,
    adminId: params.adminId,
  });

  return {
    success: true,
    message: `Nominee claim ${newStatus}.`,
  };
}

/**
 * Get nominee claim statistics (admin use).
 */
export async function getNomineeClaimStats(): Promise<{
  pending: number;
  verified: number;
  rejected: number;
  completed: number;
}> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("nominee_claims")
    .select("status");

  if (error) {
    logError(error as Error, { context: "get_nominee_claim_stats_failed" });
    return { pending: 0, verified: 0, rejected: 0, completed: 0 };
  }

  const stats = { pending: 0, verified: 0, rejected: 0, completed: 0 };
  for (const row of data || []) {
    const s = row.status as ClaimStatus;
    if (s in stats) stats[s]++;
  }

  return stats;
}

/**
 * Get claims with expired document retention (for cron cleanup).
 */
export async function getExpiredClaimDocuments(): Promise<
  { id: string; document_path: string }[]
> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("nominee_claims")
    .select("id, document_path")
    .lt("document_retained_until", now)
    .neq("document_path", "deleted");

  if (error) {
    logError(error as Error, {
      context: "get_expired_claim_documents_failed",
    });
    return [];
  }

  return data || [];
}

/**
 * Mark a claim's document as deleted (after storage cleanup).
 */
export async function markDocumentDeleted(claimId: string): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("nominee_claims")
    .update({
      document_path: "deleted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimId);

  if (error) {
    logError(error as Error, {
      context: "mark_document_deleted_failed",
      claimId,
    });
  }
}
