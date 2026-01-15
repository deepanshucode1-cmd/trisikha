import { NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { logSecurityEvent, logError } from "@/lib/logger";
import { createServiceClient } from "@/utils/supabase/service";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// Validation schema for delete request
const deleteAccountSchema = z.object({
  confirmEmail: z.string().email("Invalid email"),
  confirmPhrase: z.literal("DELETE MY ACCOUNT", "Please type 'DELETE MY ACCOUNT' to confirm"),
});

/**
 * POST /api/user/delete-account
 *
 * GDPR Right to be Forgotten - Deletes user account and anonymizes associated data
 * Requires authentication and confirmation
 *
 * Note: Order data is retained for tax compliance but anonymized
 */
export async function POST(request: Request) {
  try {
    // Rate limiting - 3 attempts per hour
    const ip = getClientIp(request);
    const { success } = await apiRateLimit.limit(`delete-account:${ip}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Require authentication
    const { user } = await requireAuth();
    const userId = user.id;
    const userEmail = user.email;

    // Parse and validate request body
    const body = await request.json();
    const parseResult = deleteAccountSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { confirmEmail } = parseResult.data;

    // Verify email matches
    if (confirmEmail.toLowerCase() !== userEmail?.toLowerCase()) {
      return NextResponse.json(
        { error: "Email does not match your account" },
        { status: 400 }
      );
    }

    // Use service client for database operations
    const supabase = createServiceClient();

    // Check for active orders that cannot be deleted
    const { data: activeOrders } = await supabase
      .from("orders")
      .select("id, shipping_status, payment_status")
      .or(`user_id.eq.${userId},guest_email.eq.${userEmail}`)
      .in("shipping_status", ["pending", "booked", "shipped"]);

    if (activeOrders && activeOrders.length > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete account with active orders",
          details: "Please wait for all orders to be delivered or cancelled before deleting your account.",
          activeOrdersCount: activeOrders.length,
        },
        { status: 400 }
      );
    }

    // Step 1: Anonymize order data (retain for tax compliance)
    const anonymizedEmail = `deleted-${Date.now()}@anonymized.local`;
    const anonymizedPhone = "0000000000";
    const anonymizedName = "Deleted User";
    const anonymizedAddress = "Address Removed";

    const { error: anonymizeError } = await supabase
      .from("orders")
      .update({
        user_id: null,
        guest_email: anonymizedEmail,
        guest_phone: anonymizedPhone,
        shipping_first_name: anonymizedName,
        shipping_last_name: "",
        shipping_address_line1: anonymizedAddress,
        shipping_address_line2: null,
        billing_first_name: anonymizedName,
        billing_last_name: "",
        billing_address_line1: anonymizedAddress,
        billing_address_line2: null,
        otp_code: null,
        otp_expires_at: null,
      })
      .or(`user_id.eq.${userId},guest_email.eq.${userEmail}`);

    if (anonymizeError) {
      logError(new Error("Failed to anonymize orders"), {
        endpoint: "/api/user/delete-account",
        userId,
        error: anonymizeError.message,
      });
      return NextResponse.json(
        { error: "Failed to process deletion request" },
        { status: 500 }
      );
    }

    // Step 2: Delete user profile from user_role table
    const { error: profileDeleteError } = await supabase
      .from("user_role")
      .delete()
      .eq("id", userId);

    if (profileDeleteError) {
      logError(new Error("Failed to delete user profile"), {
        endpoint: "/api/user/delete-account",
        userId,
        error: profileDeleteError.message,
      });
    }

    // Step 3: Delete user from Supabase Auth
    // Need admin client for this
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      logError(new Error("Failed to delete auth user"), {
        endpoint: "/api/user/delete-account",
        userId,
        error: authDeleteError.message,
      });
      return NextResponse.json(
        { error: "Failed to complete account deletion" },
        { status: 500 }
      );
    }

    // Log the deletion event
    logSecurityEvent("account_deleted", {
      userId,
      email: userEmail,
      anonymizedEmail,
      deletedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Your account has been deleted successfully. All personal data has been removed or anonymized.",
    });
  } catch (err) {
    // Handle auth errors
    const authResponse = handleAuthError(err);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(err as Error, { endpoint: "/api/user/delete-account" });
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
