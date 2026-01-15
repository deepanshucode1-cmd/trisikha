import { NextResponse } from "next/server";
import shiprocket, { retryAssignAWB } from "@/utils/shiprocket";
import { logError, logOrder } from "@/lib/logger";
import { requireRole, handleAuthError } from "@/lib/auth";
import { adminShippingRateLimit, getClientIp } from "@/lib/rate-limit";

interface OrderItem {
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  hsn: string;
  weight?: number;
  length?: number;
  breadth?: number;
  height?: number;
}

export async function POST(request: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const { success } = await adminShippingRateLimit.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Authentication - require admin role
    const { supabase } = await requireRole("admin");

    const { order_id, package_weight, package_length, package_breadth, package_height } = await request.json();

    if (!order_id) {
      return NextResponse.json(
        { error: "Missing order_id" },
        { status: 400 }
      );
    }

    // Fetch order and items from DB
    const { data: order_data, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order_data) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    const { data: order_items, error: itemError } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order_id);

    if (itemError) {
      return NextResponse.json(
        { error: "Order items not found" },
        { status: 404 }
      );
    }

    // Get Shiprocket Token
    const token = await shiprocket.login();
    if (!token) {
      return NextResponse.json(
        { error: "Failed to authenticate with Shipping partner" },
        { status: 500 }
      );
    }

    // Create Order Payload
    const sub_total = order_items?.reduce((acc: number, item: OrderItem) => acc + (item.unit_price * item.quantity), 0) || 0;

    // Determine package dimensions based on order type
    const isSingleItem = order_items?.length === 1;
    let weight: number, length: number, breadth: number, height: number;

    // Default dimensions from env (fallback values)
    const defaultWeight = parseFloat(process.env.DEFAULT_PACKAGE_WEIGHT || "1");
    const defaultLength = parseFloat(process.env.DEFAULT_PACKAGE_LENGTH || "20");
    const defaultBreadth = parseFloat(process.env.DEFAULT_PACKAGE_BREADTH || "15");
    const defaultHeight = parseFloat(process.env.DEFAULT_PACKAGE_HEIGHT || "10");

    // Priority: request body > item dimensions (single item) > defaults
    if (package_weight && package_length) {
      // Use dimensions provided from UI (multi-item orders)
      weight = package_weight;
      length = package_length;
      breadth = package_breadth || defaultBreadth;
      height = package_height || defaultHeight;
    } else if (isSingleItem && order_items) {
      // Single item: use item dimensions
      const item = order_items[0] as OrderItem;
      const itemWeight = (item.weight || 0) * item.quantity;
      weight = itemWeight > 0 ? itemWeight : defaultWeight;
      length = item.length || defaultLength;
      breadth = item.breadth || defaultBreadth;
      height = item.height || defaultHeight;
    } else {
      // Multi-item without provided dimensions: use weight sum + default box
      weight = order_items?.reduce((acc: number, item: OrderItem) => acc + (item.weight || 0) * item.quantity, 0) || defaultWeight;
      length = defaultLength;
      breadth = defaultBreadth;
      height = defaultHeight;
    }

    const orderPayload = {
      "order_id": order_data.id,
      "order_date": new Date().toISOString(),
      "pickup_location": "Home",
      "comment": "Reselling order",
      "billing_customer_name": order_data.billing_first_name,
      "billing_last_name": order_data.billing_last_name,
      "billing_address": order_data.billing_address_line1,
      "billing_address_2": order_data.billing_address_line2,
      "billing_city": order_data.billing_city,
      "billing_pincode": order_data.billing_pincode,
      "billing_state": order_data.billing_state,
      "billing_country": order_data.billing_country,
      "billing_email": order_data.guest_email,
      "billing_phone": order_data.guest_phone,
      "shipping_is_billing": false,
      "shipping_customer_name": order_data.shipping_first_name,
      "shipping_last_name": order_data.shipping_last_name,
      "shipping_address": order_data.shipping_address_line1,
      "shipping_address_2": order_data.shipping_address_line2,
      "shipping_city": order_data.shipping_city,
      "shipping_pincode": order_data.shipping_pincode,
      "shipping_country": order_data.shipping_country,
      "shipping_state": order_data.shipping_state,
      "shipping_email": order_data.guest_email,
      "shipping_phone": order_data.guest_phone,
      "order_items": order_items?.map((item: OrderItem) => ({
        "name": item.product_name,
        "sku": item.sku,
        "units": item.quantity,
        "selling_price": item.unit_price,
        "discount": 0,
        "tax": 0,
        "hsn": item.hsn
      })),
      "payment_method": "Prepaid",
      "shipping_charges": 0,
      "giftwrap_charges": 0,
      "transaction_charges": 0,
      "total_discount": 0,
      "sub_total": sub_total,
      "length": length,
      "breadth": breadth,
      "height": height,
      "weight": weight
    };

    const res1 = await fetch("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(orderPayload)
      }
    );

    if (!res1.ok || res1.status !== 200) {
      logError(new Error("Failed to create shipping order"), {
        endpoint: "/api/seller/shiprocket/assign-awb",
        order_id,
        status: res1.status
      });
      return NextResponse.json({ status: 'error', message: 'Failed to create shipping order' }, { status: 500 });
    }

    const orderResponse = await res1.json();

    // Save package dimensions to orders table for future use (returns)
    await supabase.from("orders").update({
      package_weight: weight,
      package_length: length,
      package_breadth: breadth,
      package_height: height,
    }).eq("id", order_id);

    const awbResponse = await retryAssignAWB({
      token: token,
      shipmentId: orderResponse.shipment_id,
      orderId: order_id,
      shiprocket_order_id: orderResponse.order_id,
      supabase: supabase
    });

    if (awbResponse && !awbResponse.success) {
      logOrder("awb_assignment_deferred", { order_id, shipment_id: orderResponse.shipment_id });
      return NextResponse.json({ status: 'awb_pending' }, { status: 200 });
    }

    logOrder("awb_assigned", {
      order_id,
      shipment_id: orderResponse.shipment_id,
      dimensions: { weight, length, breadth, height }
    });

    return NextResponse.json(
      {
        status: "success",
        message: "Order created and AWB assigned successfully"
      },
      { status: 200 }
    );
  } catch (err) {
    // Handle auth errors specifically
    const authResponse = handleAuthError(err);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(err as Error, { endpoint: "/api/seller/shiprocket/assign-awb" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
