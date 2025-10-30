import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import Razorpay from "razorpay";


export async function POST(req: Request) {

    const {guest_email, cart_items, total_amount, shipping_address , billing_address} = await req.json();

    const products = cart_items.map((item: any) => ({
        product_id: item.id,
        quantity: item.quantity,
        price: item.price
    }));

    const supabase = await createClient();
    const {data, error} = await supabase.from('products').select('*').in('id', cart_items.map((item: any) => item.id));

    if (error) {
        return new Response(JSON.stringify({error: error.message}), {status: 500});
    }

    // Check stock availability
    for (let item of cart_items) {
        const product = data.find((p: any) => p.id === item.id);
        if (!product || product.stock < item.quantity) {
            return new Response(JSON.stringify({error: `Insufficient stock for product ID: ${item.id}`}), {status: 400});
        }
    }

    // Deduct stock
    for (let item of cart_items) {
        const product = data.find((p: any) => p.id === item.id);
        const newStock = product.stock - item.quantity;
        const {error: updateError} = await supabase.from('products').update({stock: newStock}).eq('id', item.id);
        if (updateError) {
            return new Response(JSON.stringify({error: updateError.message}), {status: 500});
        }
    }

    // Create order
    const {data: orderData, error: orderError} = await supabase.from('orders').insert([{
        user_id : null,
        guest_email: guest_email,
        total_amount:total_amount,
        shipping_name: shipping_address.name,
        shipping_address_line1: shipping_address.address_line1,
        shipping_address_line2: shipping_address.address_line2,
        shipping_city: shipping_address.city,
        shipping_state: shipping_address.state,
        shipping_pincode: shipping_address.pincode,
        shipping_country: shipping_address.country,
        billing_name: billing_address.name,
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

    // 3️⃣ Update local DB with Razorpay order ID
    await supabase
      .from("orders")
      .update({ payment_id: razorpayOrder.id })
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