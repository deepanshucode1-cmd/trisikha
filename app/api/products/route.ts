// app/api/products/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { handleApiError } from "@/lib/errors";
import { logError } from "@/lib/logger";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      logError(new Error(error.message), { endpoint: "/api/products" });
      return NextResponse.json(
        { error: "Failed to fetch products" },
        { status: 500 }
      );
    }

    return NextResponse.json(data || [], { status: 200 });
  } catch (err) {
    return handleApiError(err, { endpoint: "/api/products" });
  }
}
