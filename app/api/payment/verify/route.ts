import crypto from 'crypto';

export async function POST(request: Request ) {

    const body = await request.json();

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';


    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(body))
        .digest('hex');

    const receivedSignature = request.headers.get('x-razorpay-signature');

    if (expectedSignature !== receivedSignature) {
        return new Response('Invalid signature', { status: 400 });
    }









}