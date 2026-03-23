/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import shiprocket, { createReturnOrder, getReturnShippingRate } from "@/utils/shiprocket";
import { requireRole, handleAuthError } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { handleApiError } from "@/lib/errors";
import { logOrder, logPayment, logAuth, logError } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import { generateCreditNoteNumber, generateCreditNotePDF } from "@/lib/creditNote";
import { sendCreditNote, sendRefundInitiated } from "@/lib/email";
import { createServiceClient } from "@/utils/supabase/service";

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
    const { user } = await requireRole("admin");
    const supabase = createServiceClient();

    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    logAuth("admin_cancel_retry", { userId: user.id, orderId });

    // 1. Fetch latest order
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error) {
      logError(new Error(error.message), { context: "retry_order_fetch_error", orderId, userId: user.id });
      return NextResponse.json({ error: "Database error while fetching order" }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Allow retry for ongoing cancellation OR return
    const isReturnOrder = order.order_status === "RETURN_REQUESTED";
    const isCancellationOrder = order.order_status === "CANCELLATION_REQUESTED";

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
        const defaultWeight = parseFloat(process.env.DEFAULT_PACKAGE_WEIGHT || "1");
        const defaultLength = parseFloat(process.env.DEFAULT_PACKAGE_LENGTH || "20");
        const defaultBreadth = parseFloat(process.env.DEFAULT_PACKAGE_BREADTH || "15");
        const defaultHeight = parseFloat(process.env.DEFAULT_PACKAGE_HEIGHT || "10");

        const packageWeight = orderItems.reduce((sum: number, item: any) => sum + (item.weight || 0) * item.quantity, 0) || defaultWeight;
        const packageLength = Math.max(...orderItems.map((item: any) => item.length || 0)) || defaultLength;
        const packageBreadth = Math.max(...orderItems.map((item: any) => item.breadth || 0)) || defaultBreadth;
        const packageHeight = Math.max(...orderItems.map((item: any) => item.height || 0)) || defaultHeight;

        let returnShippingCost = 80; // fallback
        try {
          returnShippingCost = await getReturnShippingRate({
            pickupPincode: order.shipping_pincode || "",
            deliveryPincode: warehousePincode,
            weight: packageWeight,
            length: packageLength,
            breadth: packageBreadth,
            height: packageHeight,
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
            order_items: orderItems.map((item: any) => ({
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

      // Scenario 2: RETURN_DELIVERED refund is handled by the dedicated
      // /api/admin/orders/[id]/process-return-refund endpoint (with inspection + deductions).

      // Scenario 3: Return refund failed - retry refund
      if (order.return_status === "RETURN_DELIVERED" && order.refund_status === "REFUND_FAILED") {
        logOrder("return_refund_retry_start", { orderId, adminId: user.id });

        // Use stored refund amount (already calculated with Shiprocket rate) or recalculate
        let refundAmount = order.return_refund_amount;
        if (!refundAmount) {
          const { data: refundItems } = await supabase
            .from("order_items")
            .select("*")
            .eq("order_id", orderId);

          const defaultWeight = parseFloat(process.env.DEFAULT_PACKAGE_WEIGHT || "1");
          const defaultLength = parseFloat(process.env.DEFAULT_PACKAGE_LENGTH || "20");
          const defaultBreadth = parseFloat(process.env.DEFAULT_PACKAGE_BREADTH || "15");
          const defaultHeight = parseFloat(process.env.DEFAULT_PACKAGE_HEIGHT || "10");

          const items = refundItems || [];
          const weightForRate = items.reduce((sum: number, item: any) => sum + (item.weight || 0) * item.quantity, 0) || defaultWeight;
          const lengthForRate = items.length > 0 ? Math.max(...items.map((item: any) => item.length || 0)) || defaultLength : defaultLength;
          const breadthForRate = items.length > 0 ? Math.max(...items.map((item: any) => item.breadth || 0)) || defaultBreadth : defaultBreadth;
          const heightForRate = items.length > 0 ? Math.max(...items.map((item: any) => item.height || 0)) || defaultHeight : defaultHeight;

          const forwardShippingCost = order.shipping_cost || 0;
          let returnShippingCost = 80;
          try {
            returnShippingCost = await getReturnShippingRate({
              pickupPincode: order.shipping_pincode || "",
              deliveryPincode: process.env.WAREHOUSE_PINCODE || "382721",
              weight: weightForRate,
              length: lengthForRate,
              breadth: breadthForRate,
              height: heightForRate,
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
              return_status: "RETURN_COMPLETED",
              refund_status: "REFUND_COMPLETED",
              payment_status: "refunded",
              order_status: "RETURNED",
              refund_id: result.id,
              refund_amount: actualRefundAmount,
              refund_attempted_at: new Date().toISOString(),
              refund_completed_at: new Date().toISOString(),
            }).eq("id", orderId);

            logPayment("return_refund_retry_success", { orderId, refundId: result.id, amount: actualRefundAmount, adminId: user.id });
            return NextResponse.json({ success: true, refundAmount: actualRefundAmount, refundId: result.id });
          }

          // Non-processed status (pending/created) — refund queued, webhook will finalize
          await supabase.from("orders").update({
            refund_status: "REFUND_INITIATED",
            refund_initiated_at: new Date().toISOString(),
            refund_id: result.id,
          }).eq("id", orderId);

          logPayment("return_refund_retry_pending", { orderId, refundId: result.id, status: result.status, adminId: user.id });
          return NextResponse.json({
            success: true,
            pending: true,
            refundId: result.id,
            message: "Refund queued with Razorpay. You will be notified when it is processed.",
          });
        } catch (refundErr: any) {
          await supabase.from("orders").update({
            refund_status: "REFUND_FAILED",
            refund_attempted_at: new Date().toISOString(),
            refund_error_code: refundErr?.error?.code ?? "UNKNOWN",
            refund_error_reason: refundErr?.error?.reason ?? "",
            refund_error_description: refundErr?.error?.description ?? "",
          }).eq("id", orderId);

          logPayment("return_refund_retry_failed", { orderId, error: refundErr?.error?.description, adminId: user.id });
          return NextResponse.json({ error: "Return refund retry failed" }, { status: 500 });
        }
      }

      return NextResponse.json({
        message: "Return processed",
        returnStatus: order.return_status,
      });
    }

    // ======== CANCELLATION RETRY LOGIC ========

    // 2. Retry Shiprocket Cancellation (IF FAILED EARLIER)
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

    // 3. Re-fetch after possible shiprocket cancel, then check eligibility before locking
    const { data: freshOrder, error: freshError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (freshError || !freshOrder) {
      logError(new Error("Unable to re-fetch order for refund retry"), { orderId });
      return NextResponse.json({ error: "Unable to fetch order" }, { status: 500 });
    }

    // Check eligibility: must be a cancellation (not return), paid, and shipping resolved
    const isEligibleForRefund =
      freshOrder.cancellation_status === "CANCELLATION_REQUESTED" &&
      freshOrder.payment_status === "paid" &&
      (freshOrder.shiprocket_status === "SHIPPING_CANCELLED" || freshOrder.shiprocket_status === "NOT_SHIPPED") &&
      (freshOrder.refund_status === null || freshOrder.refund_status === "REFUND_FAILED");

    if (!isEligibleForRefund) {
      return NextResponse.json({
        message: "Retry processed",
        state: { cancellation_status: freshOrder.cancellation_status, shiprocket_status: freshOrder.shiprocket_status },
      });
    }

    // Atomic lock — only proceed if refund_status is null or REFUND_FAILED
    const { data: lockResult, error: lockErr } = await supabase
      .from("orders")
      .update({
        refund_status: "REFUND_INITIATED",
        otp_code: null,
        otp_expires_at: null,
        refund_initiated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .or("refund_status.is.null,refund_status.eq.REFUND_FAILED")
      .eq("payment_status", "paid")
      .select("*");

    if (lockErr || !lockResult || lockResult.length === 0) {
      logError(new Error("Unable to acquire refund lock for retry"), { orderId, error: lockErr?.message });
      return NextResponse.json({ error: "Unable to initiate refund" }, { status: 400 });
    }

    logPayment("refund_retry_initiated", { orderId, adminId: user.id });

    // 4. Process Razorpay refund
    try {
      const result = await razorpay.payments.refund(lockResult[0].payment_id, {
        amount: lockResult[0].total_amount * 100,
      });

      if (result.status === "processed") {
        const refund_amount = result.amount ? result.amount / 100 : 0;

        // Generate credit note
        let creditNoteNo: string | null = null;
        try {
          creditNoteNo = await generateCreditNoteNumber();
        } catch (e) {
          logError(e as Error, { context: "retry_credit_note_gen_failed", orderId });
        }

        const { data: updatedOrder } = await supabase.from("orders")
          .update({
            refund_status: "REFUND_COMPLETED",
            payment_status: "refunded",
            order_status: "CANCELLED",
            cancellation_status: "CANCELLED",
            refund_id: result.id,
            refund_amount: refund_amount,
            refund_initiated_at: new Date().toISOString(),
            refund_attempted_at: new Date().toISOString(),
            refund_completed_at: new Date().toISOString(),
            credit_note_number: creditNoteNo,
          })
          .eq("id", orderId)
          .select("*");

        logPayment("refund_retry_success", {
          orderId,
          refundId: result.id,
          amount: refund_amount,
          adminId: user.id,
        });

        // DPDP Audit: Log admin-initiated refund
        const ip = getClientIp(req);
        await logDataAccess({
          tableName: "orders",
          operation: "UPDATE",
          userId: user.id,
          userRole: "admin",
          ip,
          queryType: "single",
          rowCount: 1,
          endpoint: "/api/orders/cancel/retry",
          reason: "Admin retry - order cancelled and refund processed",
          oldData: { orderId, previousStatus: order.order_status },
          newData: { orderId, newStatus: "CANCELLED", refundAmount: refund_amount },
        });

        // Send credit note email
        if (creditNoteNo && updatedOrder && updatedOrder[0]) {
          try {
            const { data: orderItems } = await supabase
              .from("order_items")
              .select("*")
              .eq("order_id", orderId);

            if (orderItems && orderItems.length > 0) {
              const pdfBuffer = await generateCreditNotePDF(updatedOrder[0], orderItems);
              const emailSent = await sendCreditNote(
                updatedOrder[0].guest_email,
                orderId,
                creditNoteNo,
                refund_amount,
                pdfBuffer
              );

              if (emailSent) {
                await supabase
                  .from("orders")
                  .update({ credit_note_sent_at: new Date().toISOString() })
                  .eq("id", orderId);
              }
            }
          } catch (cnErr) {
            logError(cnErr as Error, { context: "retry_credit_note_email_failed", orderId });
          }
        }

        // Send refund notification email
        try {
          await sendRefundInitiated(order.guest_email, orderId, refund_amount);
        } catch (emailErr) {
          logError(emailErr as Error, { context: "retry_refund_email_failed", orderId });
        }

        return NextResponse.json({ success: true, refundAmount: refund_amount });
      }

      // Non-processed status (pending/created) — refund queued, webhook will finalize
      await supabase.from("orders")
        .update({
          refund_status: "REFUND_INITIATED",
          refund_initiated_at: new Date().toISOString(),
          refund_id: result.id,
        })
        .eq("id", orderId);

      logPayment("refund_retry_pending", { orderId, refundId: result.id, status: result.status, adminId: user.id });
      return NextResponse.json({
        success: true,
        pending: true,
        refundId: result.id,
        message: "Refund queued with Razorpay. You will be notified when it is processed.",
      });
    } catch (err: any) {
      await supabase.from("orders")
        .update({
          refund_status: "REFUND_FAILED",
          refund_attempted_at: new Date().toISOString(),
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

    return NextResponse.json({
      message: "Retry processed",
      state: { cancellation_status: freshOrder.cancellation_status, shiprocket_status: freshOrder.shiprocket_status },
    });

  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return handleAuthError(error);
    }
    return handleApiError(error, { endpoint: "/api/orders/cancel/retry" });
  }
}
