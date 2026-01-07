import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import { NextResponse } from "next/server";

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Get authenticated user or throw 401
 */
export async function requireAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError(401, "Unauthorized");
  }

  return { user, supabase };
}

/**
 * Get user profile with role
 */
export async function getUserProfile(userId: string) {
  // Use service client to bypass RLS for profile lookup
  const supabase = createServiceClient();
  const { data: profile, error } = await supabase
    .from("user_role")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    throw new AuthError(403, "Profile not found");
  }

  return profile;
}

/**
 * Require specific role or throw 403
 */
export async function requireRole(role: "admin" | "customer") {
  const { user, supabase } = await requireAuth();
  const profile = await getUserProfile(user.id);

  if (profile.role !== role) {
    throw new AuthError(403, "Forbidden");
  }

  return { user, profile, supabase };
}

/**
 * Verify order ownership (user owns order OR is admin OR guest with matching email)
 */
export async function verifyOrderAccess(orderId: string, user?: any, guestEmail?: string) {
  // Use service client to bypass RLS for verification
  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("user_id, guest_email")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    throw new AuthError(404, "Order not found");
  }

  // Check if admin
  if (user) {
    const profile = await getUserProfile(user.id);
    if (profile.role === "admin") {
      return order;
    }

    // Check if user owns order
    if (order.user_id === user.id) {
      return order;
    }
  }

  // Check guest email
  if (guestEmail && order.guest_email === guestEmail) {
    return order;
  }

  throw new AuthError(404, "Order not found"); // Don't reveal order exists
}

/**
 * Handle auth errors in API routes
 */
export function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }

  console.error("Auth error:", error);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}
