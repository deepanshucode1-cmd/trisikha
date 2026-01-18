/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import shiprocket, { createReturnOrder, getReturnShippingRate } from "@/utils/shiprocket";
import nodemailer from "nodemailer";
import { requireRole, handleAuthError } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { handleApiError } from "@/lib/errors";
import { logOrder, logPayment, logAuth, logError } from "@/lib/logger";
import { generateCreditNoteNumber, generateCreditNotePDF } from "@/lib/creditNote";
import { sendCreditNote } from "@/lib/email";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  try {
    // CSRF protection for admin routes
    const csrfResult = await requireCsrf(req);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

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

    // Allow retry for ongoing cancellation OR return
    const isReturnOrder = order.order_status === "RETURN_REQUESTED";
    const isCancellationOrder = order.cancellation_status === "CANCELLATION_REQUESTED";

    if (!isReturnOrder && !isCancellationOrder) {
      return NextResponse.json({ error: "Order is not in cancellation or return state" }, { status: 400 });
    }

    // ======== RETURN RETRY LOGIC ========
    if (isReturnOrder) {
      logAuth("admin_return_retry", { userId: user.id, orderId, returnStatus: order.return_status });

      // Scenario 1: Return pickup failed - retry creating return order
      if (order.return_status === "RETURN_FAILED") {
        logOrder("return_retry_start", { orderId, adminId: user.id });

        // Fetch order items
        const { data: orderItems, error: itemsError } = await supabase
          .from("order_items")
          .select("*")
          .eq("order_id", orderId);

        if (itemsError || !orderItems || orderItems.length === 0) {
          return NextResponse.json({ error: "Unable to fetch order items" }, { status: 500 });
        }

        // Calculate refund using Shiprocket rate
        const forwardShippingCost = order.shipping_cost || 0;
        const warehousePincode = process.env.WAREHOUSE_PINCODE || "382721";

        // Determine package dimensions
        const isSingleItem = orderItems.length === 1;
        let packageWeight: number, packageLength: number, packageBreadth: number, packageHeight: number;

        // Default dimensions from env (fallback values)
        const defaultWeight = parseFloat(process.env.DEFAULT_PACKAGE_WEIGHT || "1");
        const defaultLength = parseFloat(process.env.DEFAULT_PACKAGE_LENGTH || "20");
        const defaultBreadth = parseFloat(process.env.DEFAULT_PACKAGE_BREADTH || "15");
        const defaultHeight = parseFloat(process.env.DEFAULT_PACKAGE_HEIGHT || "10");

        if (order.package_weight && order.package_length) {
          packageWeight = order.package_weight;
          packageLength = order.package_length;
          packageBreadth = order.package_breadth || defaultBreadth;
          packageHeight = order.package_height || defaultHeight;
        } else if (isSingleItem) {
          const item = orderItems[0];
          const itemWeight = (item.weight || 0) * item.quantity;
          packageWeight = itemWeight > 0 ? itemWeight : defaultWeight;
          packageLength = item.length || defaultLength;
          packageBreadth = item.breadth || defaultBreadth;
          packageHeight = item.height || defaultHeight;
        } else {
          packageWeight = defaultWeight;
          packageLength = defaultLength;
          packageBreadth = defaultBreadth;
          packageHeight = defaultHeight;
        }

        let returnShippingCost = 80; // fallback
        try {
          returnShippingCost = await getReturnShippingRate({
            pickupPincode: order.shipping_pincode || "",
            deliveryPincode: warehousePincode,
            weight: packageWeight,
          });
        } catch (e) {
          logError(e as Error, { context: "retry_return_shipping_rate_failed" });
        }

        const refundAmount = Math.max(0, order.total_amount - forwardShippingCost - returnShippingCost);

        const warehouseAddress = {
          name: process.env.WAREHOUSE_NAME || "Trishikha Organics",
          address: process.env.WAREHOUSE_ADDRESS || "Plot No 27, Swagat Industrial Area Park",
          address_2: process.env.WAREHOUSE_ADDRESS_2 || "",
          city: process.env.WAREHOUSE_CITY || "Kalol",
          state: process.env.WAREHOUSE_STATE || "Gujarat",
          country: process.env.WAREHOUSE_COUNTRY || "India",
          pincode: process.env.WAREHOUSE_PINCODE || "382721",
          email: process.env.WAREHOUSE_EMAIL || "trishikhaorganic@gmail.com",
          phone: process.env.WAREHOUSE_PHONE || "7984130253",
        };

        try {
          const returnResult = await createReturnOrder({
            orderId: orderId,
            shiprocket_order_id: order.shiprocket_order_id,
            shiprocket_shipment_id: order.shiprocket_shipment_id,
            order_date: new Date(order.created_at).toISOString().split("T")[0],
            pickup_customer_name: order.shipping_first_name || "",
            pickup_last_name: order.shipping_last_name || "",
            pickup_address: order.shipping_address_line1 || "",
            pickup_address_2: order.shipping_address_line2 || "",
            pickup_city: order.shipping_city || "",
            pickup_state: order.shipping_state || "",
            pickup_country: order.shipping_country || "India",
            pickup_pincode: order.shipping_pincode || "",
            pickup_email: order.guest_email || "",
            pickup_phone: order.guest_phone || "",
            shipping_customer_name: warehouseAddress.name,
            shipping_address: warehouseAddress.address,
            shipping_address_2: warehouseAddress.address_2,
            shipping_city: warehouseAddress.city,
            shipping_state: warehouseAddress.state,
            shipping_country: warehouseAddress.country,
            shipping_pincode: warehouseAddress.pincode,
            shipping_email: warehouseAddress.email,
            shipping_phone: warehouseAddress.phone,
            order_items: orderItems.map((item) => ({
              name: item.product_name,
              sku: item.sku || `SKU-${item.product_id}`,
              units: item.quantity,
              selling_price: item.unit_price,
              qc_enable: true,
            })),
            payment_method: "Prepaid",
            sub_total: order.total_amount,
            length: packageLength,
            breadth: packageBreadth,
            height: packageHeight,
            weight: packageWeight,
          });

          await supabase.from("orders").update({
            return_status: "RETURN_PICKUP_SCHEDULED",
            return_order_id: returnResult.order_id?.toString() || null,
            return_shipment_id: returnResult.shipment_id?.toString() || null,
            return_pickup_awb: returnResult.awb_code || null,
            return_refund_amount: refundAmount,
            return_pickup_scheduled_at: new Date().toISOString(),
          }).eq("id", orderId);

          logOrder("return_retry_success", { orderId, returnOrderId: returnResult.order_id, adminId: user.id });
          return NextResponse.json({ success: true, message: "Return pickup rescheduled", refundAmount });

        } catch (returnErr) {
          logError(returnErr as Error, { context: "return_retry_failed", orderId, adminId: user.id });
          return NextResponse.json({ error: "Return pickup retry failed" }, { status: 500 });
        }
      }

      // Scenario 2: Return received at warehouse - process refund
      if (order.return_status === "RETURN_DELIVERED") {
        logOrder("return_refund_start", { orderId, adminId: user.id });

        // Use stored refund amount (already calculated with Shiprocket rate) or calculate
        let refundAmount = order.return_refund_amount;
        if (!refundAmount) {
          const forwardShippingCost = order.shipping_cost || 0;
          const weightForRate = order.package_weight || 1;
          let returnShippingCost = 80;
          try {
            returnShippingCost = await getReturnShippingRate({
              pickupPincode: order.shipping_pincode || "",
              deliveryPincode: process.env.WAREHOUSE_PINCODE || "382721",
              weight: weightForRate,
            });
          } catch (e) {
            logError(e as Error, { context: "return_delivered_shipping_rate_failed" });
          }
          refundAmount = Math.max(0, order.total_amount - forwardShippingCost - returnShippingCost);
        }

        try {
          const result = await razorpay.payments.refund(order.payment_id, {
            amount: Math.round(refundAmount * 100), // paise
          });

          if (result.status === "processed" && result.amount) {
            const actualRefundAmount = result.amount / 100;

            // Generate credit note
            let creditNoteNo: string | null = null;
            try {
              creditNoteNo = await generateCreditNoteNumber();
            } catch (e) {
              logError(e as Error, { context: "return_credit_note_gen_failed", orderId });
            }

            await supabase.from("orders").update({
              return_status: "RETURN_REFUND_COMPLETED",
              refund_status: "REFUND_COMPLETED",
              payment_status: "refunded",
              order_status: "RETURNED",
              refund_id: result.id,
              refund_amount: actualRefundAmount,
              refund_completed_at: new Date().toISOString(),
              credit_note_number: creditNoteNo,
            }).eq("id", orderId);

            // Send credit note email
            if (creditNoteNo) {
              try {
                const { data: orderItems } = await supabase
                  .from("order_items")
                  .select("*")
                  .eq("order_id", orderId);

                if (orderItems && orderItems.length > 0) {
                  const { data: updatedOrder } = await supabase
                    .from("orders")
                    .select("*")
                    .eq("id", orderId)
                    .single();

                  if (updatedOrder) {
                    const pdfBuffer = await generateCreditNotePDF(updatedOrder, orderItems);
                    const emailSent = await sendCreditNote(
                      order.guest_email,
                      orderId,
                      creditNoteNo,
                      actualRefundAmount,
                      pdfBuffer
                    );

                    if (emailSent) {
                      await supabase.from("orders")
                        .update({ credit_note_sent_at: new Date().toISOString() })
                        .eq("id", orderId);
                    }
                  }
                }
              } catch (cnErr) {
                logError(cnErr as Error, { context: "return_credit_note_email_failed", orderId });
              }
            }

            logPayment("return_refund_success", { orderId, refundId: result.id, amount: actualRefundAmount, adminId: user.id });
            return NextResponse.json({ success: true, refundAmount: actualRefundAmount, refundId: result.id });
          }
        } catch (refundErr: any) {
          await supabase.from("orders").update({
            return_status: "RETURN_REFUND_INITIATED",
            refund_status: "REFUND_FAILED",
            refund_error_code: refundErr?.error?.code ?? "UNKNOWN",
            refund_error_reason: refundErr?.error?.reason ?? "",
            refund_error_description: refundErr?.error?.description ?? "",
          }).eq("id", orderId);

          logPayment("return_refund_failed", { orderId, error: refundErr?.error?.description, adminId: user.id });
          return NextResponse.json({ error: "Return refund failed" }, { status: 500 });
        }
      }

      // Scenario 3: Return refund failed - retry refund
      if (order.return_status === "RETURN_REFUND_INITIATED" && order.refund_status === "REFUND_FAILED") {
        logOrder("return_refund_retry_start", { orderId, adminId: user.id });

        // Use stored refund amount (already calculated with Shiprocket rate) or calculate
        let refundAmount = order.return_refund_amount;
        if (!refundAmount) {
          const forwardShippingCost = order.shipping_cost || 0;
          const weightForRate = order.package_weight || 1;
          let returnShippingCost = 80;
          try {
            returnShippingCost = await getReturnShippingRate({
              pickupPincode: order.shipping_pincode || "",
              deliveryPincode: process.env.WAREHOUSE_PINCODE || "382721",
              weight: weightForRate,
            });
          } catch (e) {
            logError(e as Error, { context: "return_refund_retry_shipping_rate_failed" });
          }
          refundAmount = Math.max(0, order.total_amount - forwardShippingCost - returnShippingCost);
        }

        try {
          const result = await razorpay.payments.refund(order.payment_id, {
            amount: Math.round(refundAmount * 100),
          });

          if (result.status === "processed" && result.amount) {
            const actualRefundAmount = result.amount / 100;

            await supabase.from("orders").update({
              return_status: "RETURN_REFUND_COMPLETED",
              refund_status: "REFUND_COMPLETED",
              payment_status: "refunded",
              order_status: "RETURNED",
              refund_id: result.id,
              refund_amount: actualRefundAmount,
              refund_completed_at: new Date().toISOString(),
            }).eq("id", orderId);

            logPayment("return_refund_retry_success", { orderId, refundId: result.id, amount: actualRefundAmount, adminId: user.id });
            return NextResponse.json({ success: true, refundAmount: actualRefundAmount, refundId: result.id });
          }
        } catch (refundErr: any) {
          logPayment("return_refund_retry_failed", { orderId, error: refundErr?.error?.description, adminId: user.id });
          return NextResponse.json({ error: "Return refund retry failed" }, { status: 500 });
        }
      }

      return NextResponse.json({
        message: "Return processed",
        returnStatus: order.return_status,
      });
    }

    // ======== CANCELLATION RETRY LOGIC (existing) ========

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
