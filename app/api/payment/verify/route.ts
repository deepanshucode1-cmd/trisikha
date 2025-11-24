import { retryPaymentUpdateStatus } from '@/utils/retry';
import { retryAssignAWB } from '@/utils/shiprocket';
import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';
import { NextResponse } from 'next/server';

export async function POST(request: Request ) {

    const body = await request.text();

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

    const receivedSignature = request.headers.get('x-razorpay-signature');

    if (expectedSignature !== receivedSignature) {
        //return new Response('Invalid signature', { status: 400 });
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

            const orderId = payload.payload.payment.entity.notes.order_id;
            retryPaymentUpdateStatus('paid', orderId, 3, 2000);
            
            break;
        case 'payment.failed':
            // Handle payment failed event
            retryPaymentUpdateStatus('failed', payload.payload.payment.entity.notes.order_id, 3, 2000);
            console.log('Payment failed:', payload.payload.payment.entity);
            break;
        // Add more cases as needed
        default:
            console.log('Unhandled event type:', eventType);
    }

    
    // You can add your logic here to handle different event types
    return new Response('ok', { status: 200 });

}