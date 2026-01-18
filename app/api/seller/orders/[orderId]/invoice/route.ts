import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { adminShippingRateLimit, getClientIp } from "@/lib/rate-limit";
import { generateReceiptPDF } from "@/lib/receipt";
import { logError, logOrder } from "@/lib/logger";

/**
 * GET /api/seller/orders/[orderId]/invoice
 * Generates and returns the invoice PDF for a given order
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success } = await adminShippingRateLimit.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Authentication - require admin role
    const { supabase } = await requireRole("admin");

    const { orderId } = await params;

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify order is paid
    if (order.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Invoice is only available for paid orders" },
        { status: 400 }
      );
    }

    // Fetch order items
    const { data: orderItems, error: itemsError } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    if (itemsError || !orderItems || orderItems.length === 0) {
      return NextResponse.json(
        { error: "Order items not found" },
        { status: 404 }
      );
    }

    // Generate PDF
    const pdfBuffer = await generateReceiptPDF(
      {
        id: orderId,
        guest_email: order.guest_email,
        guest_phone: order.guest_phone,
        total_amount: order.total_amount,
        currency: order.currency || "INR",
        payment_id: order.payment_id,
        created_at: order.created_at,
        billing_name:
          `${order.billing_first_name || ""} ${order.billing_last_name || ""}`.trim() ||
          order.billing_name,
        billing_address_line1: order.billing_address_line1,
        billing_address_line2: order.billing_address_line2,
        billing_city: order.billing_city,
        billing_state: order.billing_state,
        billing_pincode: order.billing_pincode,
        billing_country: order.billing_country,
        shipping_name:
          `${order.shipping_first_name || ""} ${order.shipping_last_name || ""}`.trim() ||
          order.shipping_name,
        shipping_address_line1: order.shipping_address_line1,
        shipping_address_line2: order.shipping_address_line2,
        shipping_city: order.shipping_city,
        shipping_state: order.shipping_state,
        shipping_pincode: order.shipping_pincode,
        shipping_country: order.shipping_country,
        // Tax fields
        taxable_amount: order.taxable_amount,
        cgst_amount: order.cgst_amount,
        sgst_amount: order.sgst_amount,
        igst_amount: order.igst_amount,
        total_gst_amount: order.total_gst_amount,
        gst_rate: order.gst_rate,
        supply_type: order.supply_type,
        shipping_cost: order.shipping_cost,
      },
      orderItems.map((item) => ({
        product_name: item.product_name,
        sku: item.sku,
        hsn: item.hsn,
        unit_price: item.unit_price,
        quantity: item.quantity,
        total_price: item.unit_price * item.quantity,
        gst_rate: item.gst_rate,
        taxable_amount: item.taxable_amount,
        gst_amount: item.gst_amount,
      }))
    );

    logOrder("invoice_downloaded", { orderId });

    // Return PDF as downloadable file
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Invoice_${orderId.slice(0, 8).toUpperCase()}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(err as Error, { endpoint: "/api/seller/orders/[orderId]/invoice" });
    return NextResponse.json(
      { error: "Failed to generate invoice" },
      { status: 500 }
    );
  }
}
