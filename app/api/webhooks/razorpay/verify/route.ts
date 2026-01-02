import { retryPaymentUpdateStatus } from '@/utils/retry';
import { retryAssignAWB } from '@/utils/shiprocket';
import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import nodemailer from "nodemailer";

export async function POST(request: Request ) {

    const body = await request.text();

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

    const receivedSignature = request.headers.get('x-razorpay-signature');

    if (expectedSignature !== receivedSignature) {
        return new Response('Invalid signature', { status: 400 });
    }


    // Process the webhook payload

    const payload = JSON.parse(body);
    console.log('Webhook payload:', payload);

    // Handle different event types
    const eventType = payload.event;
    const supabase = await createClient();

    switch (eventType) {
        case 'payment.captured':
            // Handle payment captured event
            console.log('Payment captured:', payload.payload.payment.entity);

            const razorpay_payment_id = payload.payload.payment.entity.id;
            const orderId = payload.payload.payment.entity.notes.order_id;
            retryPaymentUpdateStatus('paid', orderId, razorpay_payment_id, 3, 2000);


            const {data, error} = await supabase.from("orders").select("*").eq("id", orderId);

            if(error || data.length === 0){
                console.error("Failed to fetch order for sending confirmation email", {orderId, error});
                break;
            }
            const {data : order_items, error :order_items_error} = await supabase.from("order_items").select("*").eq("order_id", orderId);
            
                  const transporter = nodemailer.createTransport({
                      host: "smtp.gmail.com",
                      port: 587,
                      secure: false,
                      auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASS,
                      },
                    });
                
                    await transporter.sendMail({
                      from: process.env.EMAIL_USER,
                      to: data[0].guest_email,
                      subject: "TrishikhaOrganics: Your Order is Confirmed",
                      text: `Hi,\n\n Your order with Order ID: ${orderId} has been successfully placed and confirmed.
                      Here are the details of your order:\n\n${order_items && order_items.map((item: any) => `- ${item.product_name} (Quantity: ${item.quantity})`).join('\n')}\n\nTotal Amount Paid: ₹${data[0].total_amount}\n\nWe will notify you once your order is shipped.
                      \n\nThank you for shopping with TrishikhaOrganics!\n\nBest regards,\nTrishikhaOrganics Team`,
                    });
            
            break;
        case 'payment.failed':
            // Handle payment failed event
            retryPaymentUpdateStatus('failed', payload.payload.payment.entity.notes.order_id,"", 3, 2000);
            console.log('Payment failed:', payload.payload.payment.entity);
            break;
        // Add more cases as needed
        default:
            console.log('Unhandled event type:', eventType);
    }

    
    // You can add your logic here to handle different event types
    return new Response('ok', { status: 200 });

}