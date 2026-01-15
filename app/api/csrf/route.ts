import { NextResponse } from "next/server";
import { setCsrfCookie } from "@/lib/csrf";

/**
 * GET /api/csrf
 * Returns a new CSRF token and sets it in a cookie
 */
export async function GET() {
  try {
    const token = await setCsrfCookie();

    return NextResponse.json({
      success: true,
      token
    });
  } catch (error) {
    console.error("CSRF token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate CSRF token" },
      { status: 500 }
    );
  }
}
