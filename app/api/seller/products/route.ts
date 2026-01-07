import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { productSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";
import { logAuth, logError } from "@/lib/logger";

export async function GET() {
  try {
    // Require authentication (not necessarily admin for viewing products)
    const { supabase, user } = await requireRole("admin");

    logAuth("seller_access_products", { userId: user.id });

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (productsError) {
      logError(new Error(productsError.message), {
        endpoint: "/api/seller/products",
        userId: user.id,
      });
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }

    return NextResponse.json({ products: products || [] }, { status: 200 });

  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: Request) {
  try {
    // Require admin role for creating products
    const { supabase, user } = await requireRole("admin");

    const body = await req.json();

    // Validate product data
    const validatedData = productSchema.parse(body);

    logAuth("admin_create_product", {
      userId: user.id,
      productName: validatedData.name,
      sku: validatedData.sku,
    });

    // Create product
    const { data, error } = await supabase
      .from("products")
      .insert([validatedData])
      .select()
      .single();

    if (error) {
      logError(new Error(error.message), {
        endpoint: "/api/seller/products",
        userId: user.id,
        productSku: validatedData.sku,
      });
      return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
    }

    return NextResponse.json({ success: true, product: data }, { status: 201 });

  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return handleAuthError(error);
    }
    return handleApiError(error, { endpoint: "/api/seller/products POST" });
  }
}
