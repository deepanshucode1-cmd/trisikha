import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Needs service role to read users
);

export async function POST(req: Request) {
  const { email, password } = await req.json();

// Check if a user already exists
const { data: users, error } = await supabase.auth
  .admin.listUsers({ page: 1, perPage: 1 });

if (error) {
  return NextResponse.json({ error: error.message }, { status: 500 });
}

  // Allow the very first signup
  const { data, error: signupError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signupError) {
    return NextResponse.json({ error: signupError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, user: data.user });
}
