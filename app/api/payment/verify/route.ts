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
            // You can update your order status in the database here using the orderId
             let attempt = 0;
             const retries = 1;
    while (attempt < retries) {
        try {
            const supabase = await createClient();
            
            const {data,error} =  await supabase
                .from('orders')
                .update({ payment_status: 'paid'})
                .eq('id', orderId);

                console.log('Order update result:', data, error);
                if(error && attempt < retries){
                    attempt++; 
                }else{
                    //book shipping or any other post payment tasks
                    const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: "deepanshucode1@gmail.com", password: "WCUfExSSGB@#67hj" }),
                    });
                    const data = await res.json();
                    const token = data.token; // use in Authorization header for other calls
                    // Further shipping logic can be implemented here

                    console.log('Obtained Shiprocket token:', token);

                    const {data: order_data, error :order_error } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('id', orderId)
                    .single();

                    console.log('Order data:', order_data);


                    if(order_error){
                        throw new Error('Order not found');
                    }

                    const order_items_res = await supabase
                    .from('order_items')
                    .select('*')
                    .eq('order_id', orderId);

                    const order_items = order_items_res.data;

                    const sub_total = order_items?.reduce((acc, item) => acc + (item.unit_price * item.quantity), 0) || 0;

                    const weight = order_items?.reduce((acc, item) => acc + (item.weight || 0) * item.quantity, 0) || 0;
                    const length = order_items?.reduce((acc, item) => Math.max(acc, item.length || 0), 0) || 0;
                    const breadth = order_items?.reduce((acc, item) => Math.max(acc, item.breadth || 0), 0) || 0;
                    const height = order_items?.reduce((acc, item) => Math.max(acc, item.height || 0), 0) || 0;

                    console.log('weight,length,breadth,height:', weight, length, breadth, height);

                    const orderPayload = {
                    "order_id": order_data.id,
                    "order_date": new Date().toISOString(),
                    "pickup_location": "Home",
                    "comment": "Reselling order",
                    "billing_customer_name": order_data.billing_name,
                    "billing_last_name": order_data.billing_name,
                    "billing_address": order_data.billing_address_line1,
                    "billing_address_2": order_data.billing_address_line2,
                    "billing_city": order_data.billing_city,
                    "billing_pincode": order_data.billing_pincode,
                    "billing_state": order_data.billing_state,
                    "billing_country": order_data.billing_country,
                    "billing_email": order_data.guest_email,
                    "billing_phone": "9873766000",
                    "shipping_is_billing": false,
                    "shipping_customer_name": order_data.billing_name,
                    "shipping_last_name": order_data.billing_name,
                    "shipping_address": order_data.shipping_address_line1,
                    "shipping_address_2": order_data.shipping_address_line2,
                    "shipping_city": order_data.shipping_city,
                    "shipping_pincode":order_data.shipping_pincode,
                    "shipping_country": order_data.shipping_country,
                    "shipping_state": order_data.shipping_state,
                    "shipping_email": order_data.guest_email,
                    "shipping_phone": "9873766000",
                    "order_items": order_items?.map(item => ({
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
                    console.log('Order payload for Shiprocket:', orderPayload);
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
                console.log(res1);
                if(!res1.ok || res1.status !== 200){
                    return NextResponse.json({ status: 'error', message: 'Failed to create shipping order' }, { status: 500 });
                }
                const orderResponse = await res1.json();
                console.log('Shipping order response:', orderResponse);

               
                const awbResponse =  await retryAssignAWB({
                    token : token,
                    shipmentId: orderResponse.shipment_id,
                    orderId: orderResponse.order_id,
                    supabase : supabase
                });

                if (awbResponse && !awbResponse.success) {
                     console.log("AWB assignment deferred. Admin must retry later.");
                    return NextResponse.json({ status: 'awb_pending' }, { status: 200 });
                } 
                
                break; // exit the retry loop on success
                }
        } catch (error) {
            console.error('Error updating order status or booking shipment:', error);
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