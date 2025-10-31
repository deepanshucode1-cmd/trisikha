import crypto from 'crypto';

export async function POST(request: Request ) {

    const body = await request.text();

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';


    console.log("Verifying webhook with secret:", secret);

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

    const receivedSignature = request.headers.get('x-razorpay-signature');

    console.log("Expected Signature:", expectedSignature);
    console.log("Received Signature:", receivedSignature);

    if (expectedSignature !== receivedSignature) {
        return new Response('Invalid signature', { status: 400 });
    }


    // Process the webhook payload

    const payload = JSON.parse(body);
    console.log('Webhook payload:', payload);

    // Handle different event types
    const eventType = payload.event;

    switch (eventType) {
        case 'payment.captured':
            // Handle payment captured event
            console.log('Payment captured:', payload.payload.payment.entity);
            break;
        case 'payment.failed':
            // Handle payment failed event
            console.log('Payment failed:', payload.payload.payment.entity);
            break;
        // Add more cases as needed
        default:
            console.log('Unhandled event type:', eventType);
    }

    
    // You can add your logic here to handle different event types
    return new Response('ok', { status: 200 });

}