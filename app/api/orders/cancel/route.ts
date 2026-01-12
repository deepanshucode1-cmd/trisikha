/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createServiceClient } from "@/utils/supabase/service";
import shiprocket, { createReturnOrder, getReturnShippingRate } from "@/utils/shiprocket";
import nodemailer from "nodemailer";
import { cancelOrderSchema } from "@/lib/validation";
import { cancelOrderRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { logOrder, logSecurityEvent, logPayment, logError } from "@/lib/logger";
import { generateCreditNoteNumber, generateCreditNotePDF } from "@/lib/creditNote";
import { sendCreditNote, sendReturnRequestConfirmation } from "@/lib/email";

const RETURN_WINDOW_HOURS = 48;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success, limit, reset, remaining } = await cancelOrderRateLimit.limit(ip);

    if (!success) {
      logSecurityEvent("rate_limit_exceeded", {
        endpoint: "/api/orders/cancel",
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
    const validatedData = cancelOrderSchema.parse(body);
    const { orderId, otp, reason } = validatedData;

    // Use service client to bypass RLS for guest cancellation
    const supabase = createServiceClient();

    // ✅ 1. Fetch latest order state
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      logSecurityEvent("cancel_invalid_order", { orderId, ip });
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }

    if (order.cancellation_status === null) {
      return NextResponse.json({ error: "Cancellation not initiated" }, { status: 400 });
    }

    if (order.cancellation_status === "CANCELLED") {
      return NextResponse.json({ message: "Order already cancelled" });
    }

    if (order.order_status === "CHECKED_OUT") {
      return NextResponse.json({ error: "Order not confirmed yet" }, { status: 400 });
    }

    // ✅ Block duplicate final cancellation
    if (order.order_status === "CANCELLED") {
      return NextResponse.json({ message: "Order already cancelled" });
    }

    // Check if this is a return request (post-pickup or delivered)
    const isReturnEligible = order.order_status === "PICKED_UP" || order.order_status === "DELIVERED";

    if (isReturnEligible) {
      // 48-hour return window only applies to DELIVERED orders
      if (order.order_status === "DELIVERED") {
        const windowStart = new Date(order.delivered_at || order.updated_at);
        const hoursSinceDelivery = (Date.now() - windowStart.getTime()) / (1000 * 60 * 60);

        if (hoursSinceDelivery > RETURN_WINDOW_HOURS) {
          logOrder("return_window_expired", { orderId, hoursSinceDelivery });
          return NextResponse.json({
            error: "Return window expired. Returns must be requested within 48 hours of delivery."
          }, { status: 400 });
        }
      }
      // PICKED_UP orders: no time limit for returns

      // Check if return already requested
      if (order.return_status && order.return_status !== "NOT_REQUESTED") {
        return NextResponse.json({
          message: "Return already requested",
          returnStatus: order.return_status
        });
      }
    }

    if (order.order_status === "SHIPPED") {
      return NextResponse.json({ error: "Shipped orders cannot be cancelled" });
    }

    if (order.refund_status === "REFUND_INITIATED") {
      return NextResponse.json({ message: "Refund already in process" });
    }

    if (order.refund_status === "REFUND_COMPLETED") {
      return NextResponse.json({ message: "Order already refunded" });
    }

    // ✅ 2. OTP Verification with attempt tracking
    if (order.cancellation_status === "OTP_SENT") {
      // Check if OTP is locked
      if (order.otp_locked_until && new Date(order.otp_locked_until) > new Date()) {
        logSecurityEvent("otp_verification_locked", {
          orderId,
          lockedUntil: order.otp_locked_until,
          ip,
        });

        return NextResponse.json(
          {
            error: "Too many failed attempts. Account locked temporarily.",
            lockedUntil: order.otp_locked_until,
          },
          { status: 429 }
        );
      }

      // Verify OTP
      if (
        order.otp_code !== otp ||
        new Date(order.otp_expires_at) < new Date()
      ) {
        const newAttempts = (order.otp_attempts || 0) + 1;

        // Lock account after 3 failed attempts
        if (newAttempts >= 3) {
          const lockUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

          await supabase
            .from("orders")
            .update({
              otp_attempts: newAttempts,
              otp_locked_until: lockUntil.toISOString(),
            })
            .eq("id", orderId);

          logSecurityEvent("otp_account_locked", {
            orderId,
            attempts: newAttempts,
            lockedUntil: lockUntil.toISOString(),
            ip,
          });

          return NextResponse.json(
            {
              error: "Too many failed attempts. Account locked for 1 hour.",
              lockedUntil: lockUntil.toISOString(),
            },
            { status: 429 }
          );
        }

        // Increment attempts
        await supabase
          .from("orders")
          .update({ otp_attempts: newAttempts })
          .eq("id", orderId);

        logSecurityEvent("otp_verification_failed", {
          orderId,
          attempts: newAttempts,
          ip,
        });

        return NextResponse.json(
          { error: new Date(order.otp_expires_at) < new Date() ? "OTP expired" : "Invalid OTP" },
          { status: 400 }
        );
      }

      // OTP verified successfully - reset attempts
      // Check if this is a return or cancellation
      if (isReturnEligible) {
        await supabase.from("orders").update({
          order_status: "RETURN_REQUESTED",
          return_status: "RETURN_REQUESTED",
          return_requested_at: new Date().toISOString(),
          return_reason: reason,
          otp_code: null,
          otp_expires_at: null,
          otp_attempts: 0,
          otp_locked_until: null,
        }).eq("id", orderId);

        logOrder("return_otp_verified", { orderId, ip });
      } else {
        await supabase.from("orders").update({
          order_status: "CANCELLATION_REQUESTED",
          cancellation_status: "CANCELLATION_REQUESTED",
          otp_code: null,
          otp_expires_at: null,
          otp_attempts: 0,
          otp_locked_until: null,
        }).eq("id", orderId);

        logOrder("otp_verified", { orderId, ip });
      }
    }

    // ✅ 3. Re-fetch after OTP update (important for retries)
    const { data: freshOrder, error: freshError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (freshError || !freshOrder) {
      return NextResponse.json({ error: "Invalid order" }, { status: 500 });
    }

    // ✅ 3b. RETURN PROCESSING (for post-pickup orders)
    if (freshOrder.order_status === "RETURN_REQUESTED" && freshOrder.return_status === "RETURN_REQUESTED") {
      logOrder("return_processing_start", { orderId });

      // Fetch order items for return shipment
      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId);

      if (itemsError || !orderItems || orderItems.length === 0) {
        logError(new Error("Failed to fetch order items for return"), { orderId });
        return NextResponse.json({ error: "Unable to process return" }, { status: 500 });
      }

      // Calculate refund amount (deduct forward shipping + return shipping from Shiprocket)
      const forwardShippingCost = freshOrder.shipping_cost || 0;

      // Get return shipping cost from Shiprocket API
      const warehousePincode = process.env.WAREHOUSE_PINCODE || "382721";
      const returnShippingCost = await getReturnShippingRate({
        pickupPincode: freshOrder.shipping_pincode || "",
        deliveryPincode: warehousePincode,
        weight: 0.5, // Default weight, could be calculated from order items
      });

      const totalDeduction = forwardShippingCost + returnShippingCost;
      const refundAmount = Math.max(0, freshOrder.total_amount - totalDeduction);

      logOrder("return_refund_calculated", {
        orderId,
        totalAmount: freshOrder.total_amount,
        forwardShippingCost,
        returnShippingCost,
        totalDeduction,
        refundAmount,
      });

      // Get seller/warehouse address from env
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
        // Create Shiprocket return order
        const returnResult = await createReturnOrder({
          orderId: orderId,
          shiprocket_order_id: freshOrder.shiprocket_order_id,
          shiprocket_shipment_id: freshOrder.shiprocket_shipment_id,
          order_date: new Date(freshOrder.created_at).toISOString().split("T")[0],
          // Pickup from customer (reverse of delivery)
          pickup_customer_name: freshOrder.shipping_first_name || "",
          pickup_last_name: freshOrder.shipping_last_name || "",
          pickup_address: freshOrder.shipping_address_line1 || "",
          pickup_address_2: freshOrder.shipping_address_line2 || "",
          pickup_city: freshOrder.shipping_city || "",
          pickup_state: freshOrder.shipping_state || "",
          pickup_country: freshOrder.shipping_country || "India",
          pickup_pincode: freshOrder.shipping_pincode || "",
          pickup_email: freshOrder.guest_email || "",
          pickup_phone: freshOrder.guest_phone || "",
          // Ship to warehouse
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
          sub_total: freshOrder.total_amount,
          length: 20,
          breadth: 15,
          height: 10,
          weight: 0.5,
        });

        logOrder("return_order_created", {
          orderId,
          returnOrderId: returnResult.order_id,
          returnShipmentId: returnResult.shipment_id,
          returnAwb: returnResult.awb_code,
        });

        // Update order with return details
        await supabase.from("orders").update({
          return_status: "RETURN_PICKUP_SCHEDULED",
          return_order_id: returnResult.order_id?.toString() || null,
          return_shipment_id: returnResult.shipment_id?.toString() || null,
          return_pickup_awb: returnResult.awb_code || null,
          return_refund_amount: refundAmount,
          return_pickup_scheduled_at: new Date().toISOString(),
        }).eq("id", orderId);

        // Send confirmation email
        try {
          await sendReturnRequestConfirmation(
            freshOrder.guest_email,
            orderId,
            refundAmount
          );
        } catch (emailErr) {
          logError(emailErr as Error, { context: "return_email_failed", orderId });
        }

        return NextResponse.json({
          success: true,
          isReturn: true,
          message: "Return pickup scheduled",
          refundAmount,
          originalAmount: freshOrder.total_amount,
          forwardShippingCost,
          returnShippingCost,
          shippingDeduction: totalDeduction,
        });

      } catch (returnErr) {
        logError(returnErr as Error, { context: "return_order_creation_failed", orderId });

        // Mark return as failed so admin can retry
        await supabase.from("orders").update({
          return_status: "RETURN_FAILED",
          return_refund_amount: refundAmount,
        }).eq("id", orderId);

        return NextResponse.json({
          error: "Unable to schedule return pickup. Our team will contact you.",
          isReturn: true,
        }, { status: 500 });
      }
    }

    // ✅ 4. SHIPROCKET CANCELLATION (ONLY when allowed)
    if (
      freshOrder.shiprocket_order_id &&
      (
        freshOrder.order_status === "CANCELLATION_REQUESTED" && (
          freshOrder.cancellation_status === "CANCELLATION_REQUESTED" &&
          (freshOrder.shiprocket_status === "SHIPPING_CANCELLATION_FAILED"
            || freshOrder.shiprocket_status === "AWB_ASSIGNED" || freshOrder.shiprocket_status === "PICKUP_SCHEDULED"))
      )
    ) {
      logOrder("shiprocket_cancel_start", { orderId, shiprocketOrderId: freshOrder.shiprocket_order_id });

      const token = await shiprocket.login();
      if (!token) {
        await supabase.from("orders").update({
          shiprocket_status: "SHIPPING_CANCELLATION_FAILED",
          otp_code: null,
          otp_expires_at: null,
        }).eq("id", orderId);

        logOrder("shiprocket_auth_failed", { orderId });
        return NextResponse.json({ error: "Shiprocket auth failed" }, { status: 500 });
      }

      const srRes = await fetch(
        "https://apiv2.shiprocket.in/v1/external/orders/cancel",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ids: [freshOrder.shiprocket_order_id],
          }),
        }
      );

      if (!srRes.ok) {
        await supabase.from("orders").update({
          shiprocket_status: "SHIPPING_CANCELLATION_FAILED",
          otp_code: null,
          otp_expires_at: null,
        }).eq("id", orderId);

        logOrder("shiprocket_cancel_failed", { orderId, shiprocketOrderId: freshOrder.shiprocket_order_id });
        return NextResponse.json({ error: "Shipping cancellation failed" }, { status: 400 });
      }

      await supabase.from("orders").update({
        shiprocket_status: "SHIPPING_CANCELLED",
        otp_code: null,
        otp_expires_at: null,
      }).eq("id", orderId);

      logOrder("shiprocket_cancel_success", { orderId, shiprocketOrderId: freshOrder.shiprocket_order_id });
    }

    if (
      freshOrder.shiprocket_order_id &&
      freshOrder.shiprocket_status === "SHIPPING_CANCELLATION_FAILED"
    ) {
      return NextResponse.json({
        error: "Unable to cancel shipment. Please retry or contact support."
      }, { status: 409 });
    }

    // ✅ 5. REFUND INITIATION (atomic lock)
    const { data: lockResult, error: refund_fetch_error } = await supabase
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

    if (refund_fetch_error || !lockResult || lockResult.length === 0) {
      logOrder("refund_lock_failed", { orderId, error: refund_fetch_error?.message });
      return NextResponse.json({ error: "Unable to initiate refund" }, { status: 400 });
    }

    logOrder("refund_initiated", { orderId, amount: lockResult[0].total_amount });

    // ✅ 6. REFUND PROCESSING (Only AFTER shipping cancelled or not shipped yet)
    if (
      (lockResult[0].order_status === "CANCELLATION_REQUESTED" && lockResult[0].cancellation_status === "CANCELLATION_REQUESTED" &&
        (lockResult[0].shiprocket_status === "SHIPPING_CANCELLED" || lockResult[0].shiprocket_status === "NOT_SHIPPED"))
    ) {
      try {
        const razorpay_refund_result = await razorpay.payments.refund(lockResult[0].payment_id, {
          amount: lockResult[0].total_amount * 100, // amount in paise
        });

        if (razorpay_refund_result && razorpay_refund_result.amount) {
          logPayment("refund_processed", {
            orderId,
            paymentId: lockResult[0].payment_id,
            refundId: razorpay_refund_result.id,
            amount: razorpay_refund_result.amount / 100,
            status: razorpay_refund_result.status,
          });
        }

        if (razorpay_refund_result.status === "processed" && razorpay_refund_result.amount) {
          const refund_amount = razorpay_refund_result.amount / 100;

          // Step 1: Generate Credit Note Number
          let creditNoteNo: string | null = null;

          try {
            creditNoteNo = await generateCreditNoteNumber();
          } catch (e) {
            logError(e as Error, { context: "credit_note_number_gen_failed", orderId });
          }

          // Step 2: Update order with refund details (credit_note_sent_at set later after email)
          const { data: refund_update_data, error: refund_update_error } = await supabase.from("orders").update({
            refund_status: "REFUND_COMPLETED",
            payment_status: "refunded",
            order_status: "CANCELLED",
            cancellation_status: "CANCELLED",
            refund_id: razorpay_refund_result.id,
            refund_amount: refund_amount,
            refund_initiated_at: new Date().toISOString(),
            refund_completed_at: new Date().toISOString(),
            reason_for_cancellation: reason,
            otp_code: null,
            otp_expires_at: null,
            otp_attempts: 0,
            otp_locked_until: null,
            credit_note_number: creditNoteNo
            // NOTE: credit_note_sent_at is set ONLY after successful email
          }).eq("id", orderId).select();

          if (refund_update_error) {
            logError(refund_update_error, { context: "refund_update_failed", orderId });
          }

          logOrder("refund_completed", {
            orderId,
            refundAmount: refund_amount,
            refundId: razorpay_refund_result.id,
            creditNoteNumber: creditNoteNo
          });

          // Step 3: Generate and send Credit Note Email
          if (creditNoteNo && refund_update_data && refund_update_data[0]) {
            try {
              const { data: orderItems, error: itemsError } = await supabase
                .from('order_items')
                .select('*')
                .eq('order_id', orderId);

              if (itemsError) {
                logError(itemsError, { context: "credit_note_fetch_items_error", orderId });
              }

              if (orderItems && orderItems.length > 0) {
                const orderForPdf = refund_update_data[0];

                const pdfBuffer = await generateCreditNotePDF(orderForPdf, orderItems);

                // Use correct email from the fresh data
                const emailSent = await sendCreditNote(
                  refund_update_data[0].guest_email,
                  orderId,
                  creditNoteNo,
                  refund_amount,
                  pdfBuffer
                );

                // Step 4: Only mark as sent if email succeeded
                if (emailSent) {
                  await supabase
                    .from("orders")
                    .update({ credit_note_sent_at: new Date().toISOString() })
                    .eq("id", orderId);
                }
              } else {
                logError(new Error("No order items found for credit note"), { context: "credit_note_no_items", orderId });
              }
            } catch (cnError) {
              logError(cnError as Error, { context: "credit_note_generation_failed", orderId });
              // Don't set credit_note_sent_at - allows retry
            }
          }
        }

        return NextResponse.json({ success: true, refundId: razorpay_refund_result.id });

      } catch (err) {
        await supabase.from("orders").update({
          refund_status: "REFUND_FAILED",
          refund_error_code: (err as any).error?.code || "UNKNOWN_ERROR",
          refund_error_reason: (err as any).error?.reason || "No reason",
          refund_error_description: (err as any).error?.description || "No description",
          otp_code: null,
          otp_expires_at: null,
        }).eq("id", orderId);

        logPayment("refund_failed", {
          orderId,
          error: (err as any).error?.description || (err as any).message,
          errorCode: (err as any).error?.code,
        });

        return NextResponse.json({ error: "Refund failed" }, { status: 500 });
      }
    }

    // ✅ 7. If nothing matched, return safe state response
    return NextResponse.json({
      message: "Cancellation already in progress",
      status: freshOrder.cancellation_status,
    }, { status: 200 });

  } catch (err) {
    return handleApiError(err, {
      endpoint: "/api/orders/cancel",
    });
  }
}; 
