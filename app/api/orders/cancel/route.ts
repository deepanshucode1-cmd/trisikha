/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { createServiceClient } from "@/utils/supabase/service";
import shiprocket, { createReturnOrder, getReturnShippingRate } from "@/utils/shiprocket";
import nodemailer from "nodemailer";
import { cancelOrderSchema } from "@/lib/validation";
import { cancelOrderRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/errors";
import { logOrder, logSecurityEvent, logPayment, logError } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";
import { generateCreditNoteNumber, generateCreditNotePDF } from "@/lib/creditNote";
import { sendCreditNote, sendReturnRequestConfirmation } from "@/lib/email";
import { sanitizeObject } from "@/lib/xss";

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
    const sanitizedData = sanitizeObject(validatedData);
    const { orderId, otp, reason } = sanitizedData;

    // Use service client to bypass RLS for guest cancellation
    const supabase = createServiceClient();

    // ✅ 1. Fetch latest order state
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error) {
      logSecurityEvent("cancel_order_fetch_error", { orderId, ip, error: error.message });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (!order) {
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
        if (!order.delivered_at) {
          // delivered_at not recorded — updated_at is unreliable (changes on OTP sends,
          // status transitions, etc.), so we cannot calculate the window accurately.
          // Fail open: allow the return rather than penalise the customer for a data gap.
          logOrder("return_window_unknown", { orderId, reason: "delivered_at missing" });
        } else {
          const hoursSinceDelivery =
            (Date.now() - new Date(order.delivered_at).getTime()) / (1000 * 60 * 60);

          if (hoursSinceDelivery > RETURN_WINDOW_HOURS) {
            logOrder("return_window_expired", { orderId, hoursSinceDelivery });
            return NextResponse.json({
              error: "Return window expired. Returns must be requested within 48 hours of delivery."
            }, { status: 400 });
          }
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

    // Only CONFIRMED orders can be cancelled; PICKED_UP and DELIVERED are handled
    // above as returns. Everything else (SHIPPED, RETURN_REQUESTED,
    // RETURN_PICKUP_SCHEDULED, CANCELLATION_REQUESTED, etc.) is rejected here.
    if (!isReturnEligible && order.order_status !== "CONFIRMED") {
      const error = "Order cannot be cancelled or returned at this stage, please file a grievance if there is an error from our side";
      return NextResponse.json({ error }, { status: 400 });
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

      // Verify OTP (timing-safe to prevent timing attacks)
      const otpMatch = order.otp_code
        ? crypto.timingSafeEqual(Buffer.from(order.otp_code), Buffer.from(otp))
        : false;
      if (
        !otpMatch ||
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
              error: "Too many failed attempts. Please try again after 1 hour.",
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

    if (freshError) {
      logError(new Error(freshError.message), { context: "order_refetch_failed", orderId });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (!freshOrder) {
      logSecurityEvent("cancel_invalid_order", { orderId, ip });
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }

    // ✅ 3b. RETURN PROCESSING (for post-pickup orders)
    if (freshOrder.order_status === "RETURN_REQUESTED" && freshOrder.return_status === "RETURN_REQUESTED") {
      logOrder("return_processing_start", { orderId });

      // Fetch order items for return shipment
      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId);

      if (itemsError) {
        logError(new Error(itemsError.message), { context: "order_items_fetch_failed", orderId });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }

      if (!orderItems || orderItems.length === 0) {
        logError(new Error("No order items found for return"), { context: "order_items_empty", orderId });
        return NextResponse.json({ error: "Unable to process return, please file a grievance if you find an error from our side" }, { status: 500 });
      }

      // Calculate refund amount (deduct forward shipping + return shipping from Shiprocket)
      //use 0 as fallback for now
      const forwardShippingCost = freshOrder.shipping_cost || 0;

      // Determine package dimensions
      let packageWeight: number, packageLength: number, packageBreadth: number, packageHeight: number;

      // Env fallbacks — only reached for pre-constraint historical rows where
      // order_items dimensions are null (new orders always have values enforced by DB)
      const defaultWeight = parseFloat(process.env.DEFAULT_PACKAGE_WEIGHT || "1");
      const defaultLength = parseFloat(process.env.DEFAULT_PACKAGE_LENGTH || "20");
      const defaultBreadth = parseFloat(process.env.DEFAULT_PACKAGE_BREADTH || "15");
      const defaultHeight = parseFloat(process.env.DEFAULT_PACKAGE_HEIGHT || "10");

      // Compute from order_items snapshot — works for both single and multi-item
      // weight:          sum of (unit weight × quantity) across all items
      // length/breadth/height: max of each axis (box must fit the largest item per dimension)
      //db constraints ensure that weight, length, breadth, height are always positive
      packageWeight = orderItems.reduce((sum, item) => sum + (item.weight || 0) * item.quantity, 0) || defaultWeight;
      packageLength = Math.max(...orderItems.map((item) => item.length || 0)) || defaultLength;
      packageBreadth = Math.max(...orderItems.map((item) => item.breadth || 0)) || defaultBreadth;
      packageHeight = Math.max(...orderItems.map((item) => item.height || 0)) || defaultHeight;

      // Get return shipping cost from Shiprocket API (no fallback — must succeed)
      const warehousePincode = process.env.WAREHOUSE_PINCODE || "382721";
      let returnShippingCost: number;
      try {
        returnShippingCost = await getReturnShippingRate({
          pickupPincode: freshOrder.shipping_pincode || "",
          deliveryPincode: warehousePincode,
          weight: packageWeight,
          length: packageLength,
          breadth: packageBreadth,
          height: packageHeight,
        });
      } catch (rateError) {
        logError(rateError as Error, { context: "return_rate_fetch_failed", orderId });
        return NextResponse.json(
          { error: "We could not fetch the return shipping rate. Please try again in a few minutes, or file a grievance if the issue persists." },
          { status: 503 }
        );
      }

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
          length: packageLength,
          breadth: packageBreadth,
          height: packageHeight,
          weight: packageWeight,
        });

        if (!returnResult.order_id || !returnResult.awb_code) {
          throw new Error(
            `Shiprocket return order creation failed: ${returnResult.message || "missing order_id or awb_code in response"}`
          );
        }

        logOrder("return_order_created", {
          orderId,
          returnOrderId: returnResult.order_id,
          returnShipmentId: returnResult.shipment_id,
          returnAwb: returnResult.awb_code,
        });

        // DPDP Audit: Log return request (status modification)
        await logDataAccess({
          tableName: "orders",
          operation: "UPDATE",
          ip,
          queryType: "single",
          rowCount: 1,
          endpoint: "/api/orders/cancel",
          reason: "Return request - status changed to RETURN_PICKUP_SCHEDULED",
          oldData: { orderId, previousStatus: freshOrder.order_status },
          newData: { orderId, newStatus: "RETURN_PICKUP_SCHEDULED", refundAmount },
        });

        // Update order with return details
        await supabase.from("orders").update({
          return_status: "RETURN_PICKUP_SCHEDULED",
          return_order_id: returnResult.order_id?.toString() || null,
          return_shipment_id: returnResult.shipment_id?.toString() || null,
          return_pickup_awb: returnResult.awb_code || null,
          return_courier_name: returnResult.courier_name || null,
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
          error: "Unable to schedule return pickup. Please try again in a few minutes, if issue persist please contact us or file a grievance.",
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
      .eq("return_status", "NOT_REQUESTED") // Only cancellations, not returns
      .select("*");

    if (refund_fetch_error) {
      logOrder("refund_lock_db_error", { orderId, error: refund_fetch_error.message });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (!lockResult || lockResult.length === 0) {
      // The conditional UPDATE matched no rows — the order is either already
      // refunded, not paid, or was concurrently claimed by another request.
      logOrder("refund_lock_not_acquired", { orderId });
      return NextResponse.json(
        { error: "Refund could not be initiated. The order may already be refunded or is not eligible for a refund at this time." },
        { status: 400 }
      );
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

          // DPDP Audit: Log order cancellation (status modification)
          await logDataAccess({
            tableName: "orders",
            operation: "UPDATE",
            ip,
            queryType: "single",
            rowCount: 1,
            endpoint: "/api/orders/cancel",
            reason: "Order cancellation - status changed to CANCELLED, refund processed",
            oldData: { orderId, previousStatus: freshOrder.order_status },
            newData: { orderId, newStatus: "CANCELLED", refundAmount: refund_amount },
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
