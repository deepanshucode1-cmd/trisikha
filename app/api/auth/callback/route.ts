import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    // No auth code found → redirect to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = await createClient();

  // Exchange the code for a session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("OAuth callback error:", error.message);
    return NextResponse.redirect(new URL("/login?error=auth", request.url));
  }

  // ✅ Successfully authenticated
  // Redirect to homepage or dashboard
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Fetch user's role from profiles table
  const { data: profile, error: profileError } = await supabase
    .from("user_role")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("User role fetch error:", profileError?.message);
    return NextResponse.redirect(new URL("/login?error=profile", request.url));
  }

  // ✅ Redirect based on role
  let redirectPath = "/";
  switch (profile.role) {
    case "admin":
      redirectPath = "/dashboard";
      break;
    default:
      redirectPath = "/products";
  }

  return NextResponse.redirect(new URL(redirectPath, request.url));
}
