"use client";

import { createClient } from "@/utils/supabase/client";

export default function Login() {
  const supabase = createClient();

  const handleGoogleSignIn = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/api/auth/callback`,
      },
    });
    if (error) console.error(error.message);
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-semibold mb-4">Sign in to Continue</h1>
      <button
        onClick={handleGoogleSignIn}
        className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition"
      >
        Continue with Google
      </button>
    </div>
  );
}
