/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServiceClient } from "@/utils/supabase/service";
import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { checkoutSchema } from "@/lib/validation";
import { checkoutRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { logOrder, logPayment, logSecurityEvent, logError } from "@/lib/logger";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success, limit, reset, remaining } = await checkoutRateLimit.limit(ip);

    if (!success) {
      logSecurityEvent("rate_limit_exceeded", {
        endpoint: "/api/checkout",
        ip,
        limit,
      });

      return NextResponse.json(
        { error: "Too many checkout attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": new Date(reset).toISOString(),
          },
        }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const validatedData = checkoutSchema.parse(body);
    const { guest_email, guest_phone, cart_items, shipping_address, billing_address } = validatedData;

    // Calculate total amount from cart items
    // Use service client to bypass RLS for guest checkout
    const supabase = createServiceClient();

    // Fetch products
    const productIds = cart_items.map((item) => item.id);
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .in('id', productIds);

    if (productsError) {
      logError(new Error(productsError.message), {
        endpoint: "/api/checkout",
        email: guest_email,
      });
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ error: "No products found" }, { status: 400 });
    }

    // Verify stock availability and calculate total
    let calculatedTotal = 0;
    for (const item of cart_items) {
      const product = products.find((p: any) => p.id === item.id);
      if (!product) {
        logSecurityEvent("checkout_invalid_product", {
          productId: item.id,
          email: guest_email,
          ip,
        });
        return NextResponse.json(
          { error: `Product not found: ${item.id}` },
          { status: 400 }
        );
      }

      if (product.stock < item.quantity) {
        logOrder("checkout_insufficient_stock", {
          productId: item.id,
          productName: product.name,
          requested: item.quantity,
          available: product.stock,
          email: guest_email,
        });
        return NextResponse.json(
          { error: `Insufficient stock for ${product.name}. Available: ${product.stock}` },
          { status: 400 }
        );
      }

      calculatedTotal += product.price * item.quantity;
    }

    // Create order first
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert([{
        user_id: null,
        guest_email: guest_email,
        guest_phone: guest_phone,
        total_amount: calculatedTotal,
        currency: "INR",
        order_status: 'CHECKED_OUT',
        payment_status: 'initiated',
        shiprocket_status: 'NOT_SHIPPED',
        shipping_first_name: shipping_address.first_name,
        shipping_last_name: shipping_address.last_name,
        shipping_address_line1: shipping_address.address_line1,
        shipping_address_line2: shipping_address.address_line2|| '',
        shipping_city: shipping_address.city,
        shipping_state: shipping_address.state,
        shipping_pincode: shipping_address.pincode,
        shipping_country: shipping_address.country,
        billing_first_name: billing_address.first_name,
        billing_last_name: billing_address.last_name,
        billing_address_line1: billing_address.address_line1,
        billing_address_line2: billing_address.address_line2 || '',
        billing_city: billing_address.city,
        billing_state: billing_address.state,
        billing_pincode: billing_address.pincode,
        billing_country: billing_address.country,
      }])
      .select()
      .single();

    if (orderError || !orderData) {
      logError(new Error(orderError?.message || "Order creation failed"), {
        endpoint: "/api/checkout",
        email: guest_email,
      });
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
    }

    logOrder("order_created", {
      orderId: orderData.id,
      email: guest_email,
      total: calculatedTotal,
      itemCount: cart_items.length,
    });

    // Atomically deduct stock and create order items
    for (const item of cart_items) {
      const product = products.find((p: any) => p.id === item.id);
      if (!product) continue;

      // Atomic stock update using database-level decrement
      const { error: updateError } = await supabase.rpc('decrement_stock', {
        product_id: item.id,
        quantity: item.quantity
      });

      // Fallback to manual update if RPC doesn't exist
      if (updateError) {
        const newStock = product.stock - item.quantity;
        const { error: manualUpdateError } = await supabase
          .from('products')
          .update({ stock: newStock })
          .eq('id', item.id)
          .eq('stock', product.stock); // Optimistic locking

        if (manualUpdateError) {
          // Rollback: delete the order
          await supabase.from('orders').delete().eq('id', orderData.id);
          logError(new Error("Stock update failed"), {
            orderId: orderData.id,
            productId: item.id,
          });
          return NextResponse.json({ error: "Failed to update stock. Please try again." }, { status: 500 });
        }
      }

      // Create order item
      const { error: orderItemError } = await supabase.from("order_items").insert({
        order_id: orderData.id,
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        hsn: product.hsn,
        unit_price: product.price,
        weight: product.weight,
        length: product.length,
        breadth: product.breadth,
        height: product.height,
        quantity: item.quantity,
      });

      if (orderItemError) {
        logError(new Error(orderItemError.message), {
          orderId: orderData.id,
          productId: item.id,
        });
        // Continue with other items
      }
    }

    // Create Razorpay order
    try {
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(calculatedTotal * 100), // amount in paise
        currency: "INR",
        receipt: orderData.id.toString(),
        notes: {
          guest_email,
          order_id: orderData.id.toString()
        }
      });

      logPayment("razorpay_order_created", {
        orderId: orderData.id,
        razorpayOrderId: razorpayOrder.id,
        amount: calculatedTotal,
      });

      // Update order with Razorpay order ID
      await supabase
        .from("orders")
        .update({ razorpay_order_id: razorpayOrder.id })
        .eq("id", orderData.id);

      // Return checkout details
      return NextResponse.json({
        order_id: orderData.id,
        razorpay_order_id: razorpayOrder.id,
        amount: calculatedTotal,
        currency: "INR",
        key: process.env.RAZORPAY_KEY_ID,
        status: "initiated"
      });

    } catch (error: any) {
      // Rollback: delete the order and restore stock
      await supabase.from('orders').delete().eq('id', orderData.id);

      for (const item of cart_items) {
        const product = products.find((p: any) => p.id === item.id);
        if (product) {
          await supabase
            .from('products')
            .update({ stock: product.stock + item.quantity })
            .eq('id', item.id);
        }
      }

      logError(new Error(error.message), {
        orderId: orderData.id,
        endpoint: "/api/checkout",
        step: "razorpay_order_creation",
      });

      return NextResponse.json({ error: "Failed to initiate payment. Please try again." }, { status: 500 });
    }

  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/checkout",
    });
  }
}
