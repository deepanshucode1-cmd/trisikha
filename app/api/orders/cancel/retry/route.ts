/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import shiprocket from "@/utils/shiprocket";
import nodemailer from "nodemailer";
import { requireRole, handleAuthError } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { logOrder, logPayment, logAuth, logError } from "@/lib/logger";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  try {
    // Require admin role for retry operations
    const { supabase, user } = await requireRole("admin");

    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    logAuth("admin_cancel_retry", { userId: user.id, orderId });

    // 1️⃣ Fetch latest order
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      logError(new Error("Order not found for retry"), { orderId, userId: user.id });
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
      logOrder("shiprocket_cancel_retry_start", {
        orderId,
        shiprocketOrderId: order.shiprocket_order_id,
        adminId: user.id,
      });

      const token = await shiprocket.login();
      if (!token) {
        logError(new Error("Shiprocket login failed during retry"), { orderId });
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

        logOrder("shiprocket_cancel_retry_failed", { orderId, shiprocketOrderId: order.shiprocket_order_id });
        return NextResponse.json(
          { error: "Shiprocket cancellation retry failed" },
          { status: 400 }
        );
      }

      // SUCCESS
      await supabase.from("orders")
        .update({ shiprocket_status: "SHIPPING_CANCELLED" })
        .eq("id", orderId);

      logOrder("shiprocket_cancel_retry_success", { orderId, shiprocketOrderId: order.shiprocket_order_id });
    }

    // Re-fetch after possible ship cancel update
    const { data: fresh, error: refund_fetch_error } = await supabase
      .from("orders")
      .update({
        refund_status: "REFUND_INITIATED",
        otp_code: null,
        otp_expires_at: null,
        refund_initiated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .is("refund_status", null)
      .eq("payment_status", "paid")
      .select("*");

    if (refund_fetch_error || !fresh || fresh.length === 0) {
      logError(new Error("Unable to initiate refund retry"), { orderId, error: refund_fetch_error?.message });
      return NextResponse.json({ error: "Unable to initiate refund" }, { status: 400 });
    }

    logPayment("refund_retry_initiated", { orderId, adminId: user.id });

    // 3️⃣ Retry REFUND
    if (
      fresh[0].cancellation_status === "CANCELLATION_REQUESTED" &&
      fresh[0].payment_status === "paid" &&
      (
        fresh[0].shiprocket_status === "SHIPPING_CANCELLED" ||
        fresh[0].refund_status === "REFUND_FAILED" ||
        fresh[0].shiprocket_status === "NOT_SHIPPED"
      )
    ) {
      try {
        const result = await razorpay.payments.refund(fresh[0].payment_id, {
          amount: fresh[0].total_amount * 100,
        });

        if (result.status === "processed") {
          const refund_amount = result.amount ? result.amount / 100 : 0;

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

          logPayment("refund_retry_success", {
            orderId,
            refundId: result.id,
            amount: refund_amount,
            adminId: user.id,
          });

          // Send refund email
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
            subject: "TrishikhaOrganics: Order Cancelled - Refund Processed",
            text: `Hi,\n\nYour order with Order ID: ${orderId} has been successfully cancelled and refunded.\n\nRefund Amount: ₹${refund_amount}\n\nThe amount should reflect in your account within 5-7 business days depending on your bank's processing time.\n\nWe apologize for any inconvenience caused. If you have any questions, feel free to reach out to our support team.\n\nThank you,\nTrishikhaOrganics Team`,
          });

          return NextResponse.json({ success: true, refundAmount: refund_amount });
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

        logPayment("refund_retry_failed", {
          orderId,
          error: err?.error?.description || err?.message,
          adminId: user.id,
        });

        return NextResponse.json({ error: "Refund retry failed" }, { status: 500 });
      }
    }

    return NextResponse.json({
      message: "Retry processed",
      state: fresh[0],
    });

  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return handleAuthError(error);
    }
    return handleApiError(error, { endpoint: "/api/orders/cancel/retry" });
  }
}
