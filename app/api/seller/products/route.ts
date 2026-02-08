import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { productSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";
import { logAuth, logError } from "@/lib/logger";
import { sanitizeObject } from "@/lib/xss";

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
    // CSRF protection for admin routes
    const csrfResult = await requireCsrf(req);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

    // Require admin role for creating products
    const { supabase, user } = await requireRole("admin");

    const body = await req.json();

    // Validate product data
    const validatedData = productSchema.parse(body);
    const sanitizedData = sanitizeObject(validatedData);

    logAuth("admin_create_product", {
      userId: user.id,
      productName: sanitizedData.name,
      sku: sanitizedData.sku,
    });

    // Create product
    const { data, error } = await supabase
      .from("products")
      .insert([sanitizedData])
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
