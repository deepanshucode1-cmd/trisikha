import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import shiprocket, { retryAssignAWB } from "@/utils/shiprocket";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {data: sessionData} = await supabase.auth.getSession();

    if(!sessionData.session){
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const userId = sessionData.session.user.id;

    const {data : userProfile, error: profileError} = await supabase
      .from("user_role")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError || !userProfile || !userProfile.role || userProfile.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const { order_id } = await request.json();

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

    // ---- ① Get Shiprocket Token ----
    const token = await shiprocket.login();
    if (!token) {
      return NextResponse.json(
        { error: "Failed to authenticate with Shipping partner" },
        { status: 500 }
      );
    }

    // ---- ② Create Order Payload ----
 
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
                    orderId: order_id,
                    supabase : supabase
                });

                if (awbResponse && !awbResponse.success) {
                     console.log("AWB assignment deferred. Admin must retry later.");
                    return NextResponse.json({ status: 'awb_pending' }, { status: 200 });
                } 
                
    return NextResponse.json(
      {
        status: "success",
        message: "Order created and AWB assigned successfully"
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Assign AWB error:", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
