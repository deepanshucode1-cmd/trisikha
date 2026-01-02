import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@/utils/supabase/server";
import shiprocket from "@/utils/shiprocket";
import nodemailer from "nodemailer";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = await createClient();

    // 1️⃣ Fetch latest order
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Only allow retry for ongoing cancellation
    if (order.cancellation_status !== "CANCELLATION_REQUESTED") {
      return NextResponse.json({ error: "Order is not in cancellation state" }, { status: 400 });
    }

    // 2️⃣ Retry Shiprocket Cancellation (IF FAILED EARLIER)
    if (
      order.shiprocket_order_id &&
      order.shiprocket_status === "SHIPPING_CANCELLATION_FAILED"
    ) {
      const token = await shiprocket.login();
      if (!token) {
        return NextResponse.json(
          { error: "Shiprocket login failed" },
          { status: 503 }
        );
      }

      const srRes = await fetch(
        "https://apiv2.shiprocket.in/v1/external/orders/cancel",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: [order.shiprocket_order_id] }),
        }
      );

      if (!srRes.ok) {
        await supabase.from("orders")
          .update({ shiprocket_status: "SHIPPING_CANCELLATION_FAILED" })
          .eq("id", orderId);

        return NextResponse.json(
          { error: "Shiprocket cancellation retry failed" },
          { status: 400 }
        );
      }

      // SUCCESS
      await supabase.from("orders")
        .update({ shiprocket_status: "SHIPPING_CANCELLED" })
        .eq("id", orderId);
    }

    // Re-fetch after possible ship cancel update
        const { data: fresh, error : refund_fetch_error } = await supabase
    .from("orders")
    .update({
      refund_status: "REFUND_INITIATED",
      otp_code: null,
      otp_expires_at: null,
      refund_initiated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .is("refund_status", null)
    .eq("payment_status", "paid")   // 👈 CRITICAL
    .select("*");

    if(refund_fetch_error || !fresh || fresh.length === 0){
     return NextResponse.json({ error: "Unable to initiate refund" }, { status: 400 });
    }


    // 3️⃣ Retry REFUND if:
    // • Shipping cancelled OR order never shipped
    // • Refund previously failed
    if (
          fresh[0].cancellation_status === "CANCELLATION_REQUESTED" && // 👈 MUST CHECK
            fresh[0].payment_status === "paid" &&
            (
                // refund retry only if shipping is already cancelled
                fresh[0].shiprocket_status === "SHIPPING_CANCELLED" ||
                // refund-only retry if refund failed earlier
                fresh[0].refund_status === "REFUND_FAILED" ||
                // If order was never shipped, no need to hit SR at all
                (fresh[0].shiprocket_status === "NOT_SHIPPED")
            )
        )
    {
      try {
        const result = await razorpay.payments.refund(fresh[0].payment_id, {
          amount: fresh[0].total_amount * 100,
        });

        if (result.status === "processed") {

           let refund_amount = 0;
          if(result.amount){
            refund_amount = result.amount / 100;
          }
          await supabase.from("orders")
            .update({
              refund_status: "REFUND_COMPLETED",
              payment_status: "refunded",
              order_status: "CANCELLED",
              cancellation_status: "CANCELLED",
              refund_id: result.id,
              refund_amount: refund_amount,
              refund_initiated_at: new Date().toISOString(),
              refund_completed_at: new Date().toISOString(),
            })
            .eq("id", orderId);


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
                          to: order.guest_email,
                          subject: "TrishikhaOrganics: Order has been Cancelled and Refunded",
                          text: `Hi,\n\n Your order with Order ID: ${orderId} has been successfully cancelled and refunded.
                          \n\nRefund Amount: ₹${refund_amount}\n\nThe amount should reflect in your account within 5-7 business days depending on your bank's processing time.
                          \n\nWe apologize for any inconvenience caused. If you have any questions, feel free to reach out to our support team.
                          \n\nThank you,\nTrishikhaOrganics Team`,
                        });

          return NextResponse.json({ success: true });
        }
      } catch (err: any) {
        await supabase.from("orders")
          .update({
            refund_status: "REFUND_FAILED",
            refund_error_code: err?.error?.code ?? "UNKNOWN",
            refund_error_reason: err?.error?.reason ?? "",
            refund_error_description: err?.error?.description ?? "",
          })
          .eq("id", orderId);

        return NextResponse.json({ error: "Refund retry failed" }, { status: 500 });
      }
    }

    return NextResponse.json({
      message: "Retry processed — action pending or success already",
      state: fresh,
    });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
