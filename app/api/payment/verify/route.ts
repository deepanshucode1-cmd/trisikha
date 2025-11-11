import { retryPaymentUpdateStatus } from '@/utils/retry';
import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

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

            const orderId = payload.payload.payment.entity.notes.order_id;
            // You can update your order status in the database here using the orderId
             let attempt = 0;
             const retries = 3;
    while (attempt < retries) {
        try {
            const supabase = await createClient();
            
            const {data,error} =  await supabase
                .from('orders')
                .update({ status: 'paid'})
                .eq('id', orderId);

                if(error && attempt < retries){
                    attempt++; 
                }else{
                    //book shipping or any other post payment tasks
                    const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: "your_api_user@example.com", password: "PASSWORD" }),
                    });
                    const data = await res.json();
                    const token = data.token; // use in Authorization header for other calls
                    // Further shipping logic can be implemented here

                    const {data: order_data, error :order_error } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('id', orderId)
                    .single();


                    if(order_error){
                        throw new Error('Order not found');
                    }

                    const orderPayload = {
                    "order_id": order_data.id,
                    "order_date": new Date().toISOString(),
                    "pickup_location": "WareHouse 1",
                    "comment": "Reseller: M/s Goku",
                    "billing_customer_name": order_data.billing_name,
                    "billing_last_name": order_data.billing_name,
                    "billing_address": order_data.billing_address_line1,
                    "billing_address_2": order_data.billing_address_line2,
                    "billing_city": order_data.billing_city,
                    "billing_pincode": order_data.billing_pincode,
                    "billing_state": order_data.billing_state,
                    "billing_country": order_data.billing_country,
                    "billing_email": order_data.guest_email,
                    "billing_phone": order_data.guest_phone,
                    "shipping_is_billing": true,
                    "shipping_customer_name": order_data.billing_name,
                    "shipping_last_name": order_data.billing_name,
                    "shipping_address": order_data.shipping_address_line1,
                    "shipping_address_2": order_data.shipping_address_line2,
                    "shipping_city": order_data.shipping_city,
                    "shipping_pincode":order_data.shipping_pincode,
                    "shipping_country": order_data.shipping_country,
                    "shipping_state": order_data.shipping_state,
                    "shipping_email": order_data.guest_email,
                    "shipping_phone": order_data.guest_phone,
                    "order_items": [
                    {
                    "name": "Kunai",
                    "sku": "chakra123",
                    "units": 10,
                    "selling_price": 900,
                    "discount": "",
                    "tax": "",
                     "hsn": 441122
            }
        ],
                    "payment_method": "Prepaid",
                    "shipping_charges": 0,
                    "giftwrap_charges": 0,
                    "transaction_charges": 0,
                    "total_discount": 0,
                    "sub_total": 9000,
                    "length": 10,
                    "breadth": 15,
                    "height": 20,
                    "weight": 2.5
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
const orderResponse = await res.json();

                    break; // exit the retry loop on success


                    
                }
        } catch (error) {
            attempt++;
            if (attempt >= retries) {
                throw error;
            }
            const delay = 2000 * attempt; // exponential backoff
            await new Promise(res => setTimeout(res, delay));
        }
    }

            
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