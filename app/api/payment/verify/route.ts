/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { createServiceClient } from "@/utils/supabase/service";
import nodemailer from "nodemailer";
import { paymentVerifySchema } from "@/lib/validation";
import { paymentRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { logPayment, logOrder, logSecurityEvent, logError } from "@/lib/logger";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success, limit, reset, remaining } = await paymentRateLimit.limit(ip);

    if (!success) {
      logSecurityEvent("rate_limit_exceeded", {
        endpoint: "/api/payment/verify",
        ip,
        limit,
      });

      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": new Date(reset).toISOString(),
          },
        }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const validatedData = paymentVerifySchema.parse(body);
    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = validatedData;

    logPayment("verification_started", {
      orderId: order_id,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      ip,
    });

    // 1. Verify Signature using timingSafeEqual (prevent timing attacks)
    const signatureBody = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(signatureBody)
      .digest("hex");

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(razorpay_signature)
    );

    if (!isValid) {
      logSecurityEvent("payment_signature_invalid", {
        orderId: order_id,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        ip,
      });
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    // 2. Double-check payment status with Razorpay API
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.status !== "captured" && payment.status !== "authorized") {
      logPayment("verification_failed_at_gateway", {
        orderId: order_id,
        razorpayPaymentId: razorpay_payment_id,
        paymentStatus: payment.status,
      });
      return NextResponse.json({ error: "Payment not successful at gateway" }, { status: 400 });
    }

    // 3. Verify payment amount matches order amount
    // Use service client to bypass RLS for guest payment verification
    const supabase = createServiceClient();
    const { data: orderCheck, error: orderCheckError } = await supabase
      .from("orders")
      .select("total_amount, guest_email, payment_status")
      .eq("id", order_id)
      .single();

    if (orderCheckError || !orderCheck) {
      logError(new Error("Order not found during payment verification"), {
        orderId: order_id,
        razorpayPaymentId: razorpay_payment_id,
      });
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify amount (payment.amount is in paise, orderCheck.total_amount is in rupees)
    const paymentAmountInRupees = Number(payment.amount) / 100;
    if (Math.abs(paymentAmountInRupees - orderCheck.total_amount) > 0.01) {
      logSecurityEvent("payment_amount_mismatch", {
        orderId: order_id,
        expectedAmount: orderCheck.total_amount,
        receivedAmount: paymentAmountInRupees,
        razorpayPaymentId: razorpay_payment_id,
        ip,
      });
      return NextResponse.json(
        { error: "Payment amount mismatch" },
        { status: 400 }
      );
    }

    // 4. Update order status (atomic operation with conditional update)
    const { data, error } = await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        order_status: "CONFIRMED",
        shiprocket_status: "NOT_SHIPPED",
        payment_id: razorpay_payment_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order_id)
      .eq("payment_status", "initiated") // Prevent double-processing
      .select();

    // Handle database errors
    if (error) {
      // 🚨 CRITICAL: Payment captured but DB update failed
      logError(new Error("Payment captured but DB update failed"), {
        orderId: order_id,
        razorpayPaymentId: razorpay_payment_id,
        dbError: error.message,
        severity: "CRITICAL",
      });

      // Return success to user (payment went through)
      // Background job should sync this later
      return NextResponse.json({
        success: true,
        warning: "Payment captured, order status pending sync"
      });
    }

    // Check if already processed
    if (data.length === 0) {
      // Check if already paid
      if (orderCheck.payment_status === "paid") {
        logPayment("verification_already_processed", {
          orderId: order_id,
          razorpayPaymentId: razorpay_payment_id,
        });
        return NextResponse.json({
          success: true,
          message: "Payment already processed"
        });
      }

      logError(new Error("Order update failed - no rows affected"), {
        orderId: order_id,
        razorpayPaymentId: razorpay_payment_id,
        currentPaymentStatus: orderCheck.payment_status,
      });
      return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
    }

    // 5. Fetch order items for confirmation email
    const { data: order_items, error: order_items_error } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order_id);

    if (order_items_error) {
      logError(new Error(order_items_error.message), {
        orderId: order_id,
        step: "fetch_order_items",
      });
    }

    // 6. Send confirmation email
    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const itemsHtml = order_items?.map((item: any) =>
        `<tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.product_name}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${item.unit_price}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${item.unit_price * item.quantity}</td>
        </tr>`
      ).join('') || '';

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: data[0].guest_email,
        subject: "TrishikhaOrganics: Order Confirmed - Payment Successful",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2d5016;">Order Confirmed!</h2>
            <p>Hi,</p>
            <p>Your order with Order ID <strong>${order_id}</strong> has been successfully placed and confirmed.</p>

            <h3>Order Details:</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background-color: #f4f4f4;">
                  <th style="padding: 10px; text-align: left;">Product</th>
                  <th style="padding: 10px; text-align: center;">Quantity</th>
                  <th style="padding: 10px; text-align: right;">Price</th>
                  <th style="padding: 10px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
              <tfoot>
                <tr style="background-color: #f9f9f9; font-weight: bold;">
                  <td colspan="3" style="padding: 15px; text-align: right;">Total Amount Paid:</td>
                  <td style="padding: 15px; text-align: right;">₹${data[0].total_amount}</td>
                </tr>
              </tfoot>
            </table>

            <p><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
            <p>We will notify you once your order is shipped.</p>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #888; font-size: 12px;">
              Thank you for shopping with TrishikhaOrganics!<br>
              Best regards,<br>
              TrishikhaOrganics Team
            </p>
          </div>
        `,
        text: `Hi,\n\nYour order with Order ID: ${order_id} has been successfully placed and confirmed.\n\nOrder Details:\n${order_items?.map((item: any) => `- ${item.product_name} (Quantity: ${item.quantity}) - ₹${item.unit_price * item.quantity}`).join('\n')}\n\nTotal Amount Paid: ₹${data[0].total_amount}\nPayment ID: ${razorpay_payment_id}\n\nWe will notify you once your order is shipped.\n\nThank you for shopping with TrishikhaOrganics!\n\nBest regards,\nTrishikhaOrganics Team`,
      });

      logOrder("confirmation_email_sent", {
        orderId: order_id,
        email: data[0].guest_email,
      });

    } catch (emailError) {
      // Don't fail the request if email fails
      logError(emailError as Error, {
        orderId: order_id,
        step: "send_confirmation_email",
      });
    }

    logPayment("verification_success", {
      orderId: order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount: data[0].total_amount,
    });

    return NextResponse.json({ success: true });

  } catch (err) {
    return handleApiError(err, {
      endpoint: "/api/payment/verify",
    });
  }
}
