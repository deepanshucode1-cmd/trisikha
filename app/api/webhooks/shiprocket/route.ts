import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import shiprocket from "@/utils/shiprocket";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  const payload = await req.json();

  const apiKey = req.headers.get("x-api-key");
    const expectedKey = process.env.SHIPROCKET_WEBHOOK_SECRET;

    if (!apiKey || apiKey !== expectedKey) {
      console.error("Invalid Shiprocket Webhook Token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    
  const supabase = await createClient();

  const awb = payload.awb;
  const statusLabel = payload["sr-status-label"];


  if(statusLabel === undefined || awb === undefined){
    return NextResponse.json({ error: "Invalid payload" }, { status: 200 });
  }

  if(statusLabel === "Delivered"){
    // Update delivery timestamp
    await supabase
      .from("orders")
      .update({
        shiprocket_status: statusLabel,
        order_status: "DELIVERED",
      })
      .eq("shiprocket_awb_code", awb);

      const {data : order_data, error : order_error} = await supabase.from("orders").select("*").eq("shiprocket_awb_code", awb).single();

      if(order_error || !order_data){
        return NextResponse.json({ error: "Order not found" }, { status: 200 });
      }

      const orderId = order_data.id;
      const refund_amount = order_data.refund_amount || 0;

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
                    to: order_data.guest_email,
                    subject: "TrishikhaOrganics: Order has been Delivered",
                    text: `Hi,\n\n Your order with Order ID: ${orderId} has been successfully delivered.
                    `,
                  });


  }else if(statusLabel === "PICKED UP"){
    // Update shipped timestamp
    await supabase
      .from("orders")
      .update({
        shiprocket_status: statusLabel,
        order_status: "PICKED_UP",
      })
      .eq("shiprocket_awb_code", awb);  

      const {data : order_data, error : order_error} = await supabase.from("orders").select("*").eq("shiprocket_awb_code", awb).single();

      if(order_error || !order_data){
        return NextResponse.json({ error: "Order not found" }, { status: 200 });
      }

      const orderId = order_data.id;
      const refund_amount = order_data.refund_amount || 0;

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
                    to: order_data.guest_email,
                    subject: "TrishikhaOrganics: Order has been shipped",
                    text: `Hi,\n\n Your order with Order ID: ${orderId} has been shipped.
                    `,
                  });


  }else{

  await supabase
    .from("orders")
    .update({
      shiprocket_status: statusLabel,
    })
    .eq("shiprocket_awb_code", awb);

  }
  return NextResponse.json({ success: true });
}
