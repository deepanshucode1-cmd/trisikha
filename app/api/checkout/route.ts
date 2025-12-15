/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@/utils/supabase/server";
import { Weight } from "lucide-react";
import { NextResponse } from "next/server";
import Razorpay from "razorpay";


export async function POST(req: Request) {

    const {guest_email, guest_phone, cart_items, total_amount, shipping_address , billing_address} = await req.json();


    const supabase = await createClient();
    const {data, error} = await supabase.from('products').select('*').in('id', cart_items.map((item: any) => item.id));

    if (error) {
        return new Response(JSON.stringify({error: error.message}), {status: 500});
    }

    // Check stock availability
    for (const item of cart_items) {
        const product = data.find((p: any) => p.id === item.id);
        if (!product || product.stock < item.quantity) {
            return new Response(JSON.stringify({error: `Insufficient stock for product ID: ${item.id}`}), {status: 400});
        }
    }

    // Deduct stock
    

    // Create order
    const {data: orderData, error: orderError} = await supabase.from('orders').insert([{
        user_id : null,
        guest_email: guest_email,
        guest_phone: guest_phone,
        total_amount:total_amount,
        order_status: 'CHECKED_OUT',
        shipping_first_name: shipping_address.first_name,
        shipping_last_name: shipping_address.last_name,
        shipping_address_line1: shipping_address.address_line1,
        shipping_address_line2: shipping_address.address_line2,
        shipping_city: shipping_address.city,
        shipping_state: shipping_address.state,
        shipping_pincode: shipping_address.pincode,
        shipping_country: shipping_address.country,
        billing_first_name: billing_address.first_name,
        billing_last_name: billing_address.last_name,
        billing_address_line1: billing_address.address_line1,
        billing_address_line2: billing_address.address_line2,
        billing_city: billing_address.city,
        billing_state: billing_address.state,
        billing_pincode: billing_address.pincode,
        billing_country: billing_address.country,
    }]).select().single();

    if (orderError) {
        return new Response(JSON.stringify({error: orderError.message}), {status: 500});
    }

    for (const item of cart_items) {
        const product = data.find((p: any) => p.id === item.id);
        const newStock = product.stock - item.quantity;
        const {error: updateError} = await supabase.from('products').update({stock: newStock}).eq('id', item.id);
        if (updateError) {
            return new Response(JSON.stringify({error: updateError.message}), {status: 500});
        }

    const  {data: data1,error:orderItemError} =  await supabase.from("order_items").insert({
    order_id: orderData.id,
    product_id: product.id,
    product_name: product.name,
    sku: product.sku,
    hsn: product.hsn,
    unit_price: product.price,
    weight : product.weight,
    length : product.length,
    breadth : product.breadth,
    height : product.height,
    quantity: item.quantity,
  });


    console.log(data1);
    console.log(orderItemError);

    }


    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID || '',
        key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });

    const options = {
        amount: total_amount * 100, // amount in the smallest currency unit
        currency: "INR",
        receipt: `receipt_order`,
    };

    try {
        
        // Save Razorpay order ID in your database
        const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(total_amount * 100), // amount in paise
      currency: "INR",
      receipt: "receipt", // store local order_id in receipt
      notes: {
        guest_email,
        order_id: orderData.id.toString()
      }
    });

    console.log("Razorpay Order Created:", razorpayOrder);

    // 3️⃣ Update local DB with Razorpay order ID
    await supabase
      .from("orders")
      .update({ razorpay_order_id: razorpayOrder.id })
      .eq("id", orderData.id);

    // 4️⃣ Respond with details for frontend checkout
    return NextResponse.json({
      order_id: orderData.id,
      razorpay_order_id: razorpayOrder.id,
      amount: total_amount,
      currency: "INR",
      key: process.env.RAZORPAY_KEY_ID,
      status: "initiated"
    });
    } catch (error: any) {
        console.log(error);
        return new Response(JSON.stringify({error: error.message}), {status: 500});
    }

}