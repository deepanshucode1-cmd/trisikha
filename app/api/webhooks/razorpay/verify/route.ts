/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createServiceClient } from "@/utils/supabase/service";
import { logPayment, logOrder, trackSecurityEvent, logError } from "@/lib/logger";
import { generateReceiptPDF } from "@/lib/receipt";

export async function POST(request: Request) {
  const body = await request.text();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

  // Verify webhook signature using timing-safe comparison
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  const receivedSignature = request.headers.get("x-razorpay-signature") || "";

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(receivedSignature)
    );

    if (!isValid) {
      await trackSecurityEvent("webhook_signature_invalid", {
        endpoint: "/api/webhooks/razorpay/verify",
        ip: request.headers.get("x-forwarded-for") || "unknown",
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } catch {
    await trackSecurityEvent("webhook_signature_invalid", {
      endpoint: "/api/webhooks/razorpay/verify",
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const payload = JSON.parse(body);
  const eventType = payload.event;

  logPayment("webhook_received", {
    eventType,
    paymentId: payload.payload?.payment?.entity?.id,
  });

  // Use service client for webhooks (no user session)
  const supabase = createServiceClient();

  switch (eventType) {
    case "payment.captured": {
      const paymentEntity = payload.payload.payment.entity;
      const razorpay_payment_id = paymentEntity.id;
      const orderId = paymentEntity.notes?.order_id;

      if (!orderId) {
        logError(new Error("Missing order_id in webhook payload"), {
          razorpay_payment_id,
        });
        return NextResponse.json({ error: "Missing order_id" }, { status: 400 });
      }

      logPayment("webhook_payment_captured", {
        orderId,
        razorpay_payment_id,
        amount: paymentEntity.amount,
      });

      // Update order status (only if not already processed)
      const { data: updateData, error: updateError } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          order_status: "CONFIRMED",
          shiprocket_status: "NOT_SHIPPED",
          payment_id: razorpay_payment_id,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("payment_status", "initiated")
        .select();

      if (updateError) {
        logError(new Error("Webhook: Failed to update order status"), {
          orderId,
          razorpay_payment_id,
          error: updateError.message,
        });
        break;
      }

      // If no rows updated, payment was already processed (by /api/payment/verify)
      // Skip email to avoid duplicates
      if (!updateData || updateData.length === 0) {
        logPayment("webhook_payment_already_processed", {
          orderId,
          razorpay_payment_id,
        });
        break;
      }

      // Fetch order details for email
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (orderError || !orderData) {
        logError(new Error("Webhook: Failed to fetch order"), {
          orderId,
          error: orderError?.message,
        });
        break;
      }

      // Fetch order items
      const { data: order_items, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId);

      if (itemsError) {
        logError(new Error("Webhook: Failed to fetch order items"), {
          orderId,
          error: itemsError.message,
        });
      }

      // Send confirmation email with receipt
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

        // Generate PDF receipt
        let receiptPdf: Buffer | null = null;
        try {
          if (order_items && order_items.length > 0) {
            receiptPdf = await generateReceiptPDF(
              {
                id: orderId,
                guest_email: orderData.guest_email,
                guest_phone: orderData.guest_phone,
                total_amount: orderData.total_amount,
                currency: orderData.currency || "INR",
                payment_id: razorpay_payment_id,
                created_at: orderData.created_at,
                billing_name: `${orderData.billing_first_name || ''} ${orderData.billing_last_name || ''}`.trim() || orderData.billing_name,
                billing_address_line1: orderData.billing_address_line1,
                billing_address_line2: orderData.billing_address_line2,
                billing_city: orderData.billing_city,
                billing_state: orderData.billing_state,
                billing_pincode: orderData.billing_pincode,
                billing_country: orderData.billing_country,
                shipping_name: `${orderData.shipping_first_name || ''} ${orderData.shipping_last_name || ''}`.trim() || orderData.shipping_name,
                shipping_address_line1: orderData.shipping_address_line1,
                shipping_address_line2: orderData.shipping_address_line2,
                shipping_city: orderData.shipping_city,
                shipping_state: orderData.shipping_state,
                shipping_pincode: orderData.shipping_pincode,
                shipping_country: orderData.shipping_country,
                // Tax fields
                taxable_amount: orderData.taxable_amount,
                cgst_amount: orderData.cgst_amount,
                sgst_amount: orderData.sgst_amount,
                igst_amount: orderData.igst_amount,
                total_gst_amount: orderData.total_gst_amount,
                gst_rate: orderData.gst_rate,
                supply_type: orderData.supply_type,
                shipping_cost: orderData.shipping_cost,
              },
              order_items.map((item: any) => ({
                product_name: item.product_name,
                sku: item.sku,
                hsn: item.hsn,
                unit_price: item.unit_price,
                quantity: item.quantity,
                total_price: item.unit_price * item.quantity,
                gst_rate: item.gst_rate,
                taxable_amount: item.taxable_amount,
                gst_amount: item.gst_amount,
              }))
            );
            logOrder("webhook_receipt_pdf_generated", { orderId });
          }
        } catch (pdfError) {
          logError(pdfError as Error, {
            orderId,
            step: "webhook_generate_receipt_pdf",
          });
        }

        // Calculate tax values for email
        const gstRate = orderData.gst_rate ?? 5;
        const taxableAmount = orderData.taxable_amount ?? Math.round((orderData.total_amount - (orderData.shipping_cost || 0)) / 1.05 * 100) / 100;
        const totalGst = orderData.total_gst_amount ?? Math.round((orderData.total_amount - (orderData.shipping_cost || 0) - taxableAmount) * 100) / 100;
        const shippingCost = orderData.shipping_cost ?? 0;

        const itemsHtml =
          order_items
            ?.map((item: any) => {
              const itemTaxable = item.taxable_amount ?? Math.round((item.unit_price * item.quantity) / 1.05 * 100) / 100;
              const itemGst = item.gst_amount ?? Math.round((item.unit_price * item.quantity - itemTaxable) * 100) / 100;
              return `<tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.product_name}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">Rs ${item.unit_price.toFixed(2)}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">Rs ${itemTaxable.toFixed(2)}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">Rs ${itemGst.toFixed(2)}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">Rs ${(item.unit_price * item.quantity).toFixed(2)}</td>
            </tr>`;
            })
            .join("") || "";

        // Build tax summary for email
        let taxSummaryHtml = '';
        if (orderData.supply_type === 'interstate') {
          taxSummaryHtml = `
            <tr>
              <td colspan="5" style="padding: 10px; text-align: right;">IGST @${gstRate}%:</td>
              <td style="padding: 10px; text-align: right;">Rs ${(orderData.igst_amount ?? totalGst).toFixed(2)}</td>
            </tr>`;
        } else {
          const halfRate = gstRate / 2;
          const cgst = orderData.cgst_amount ?? Math.round(totalGst / 2 * 100) / 100;
          const sgst = orderData.sgst_amount ?? Math.round(totalGst / 2 * 100) / 100;
          taxSummaryHtml = `
            <tr>
              <td colspan="5" style="padding: 10px; text-align: right;">CGST @${halfRate}%:</td>
              <td style="padding: 10px; text-align: right;">Rs ${cgst.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="5" style="padding: 10px; text-align: right;">SGST @${halfRate}%:</td>
              <td style="padding: 10px; text-align: right;">Rs ${sgst.toFixed(2)}</td>
            </tr>`;
        }

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: orderData.guest_email,
          subject: "TrishikhaOrganics: Order Confirmed - Payment Successful",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
              <h2 style="color: #2d5016;">Order Confirmed!</h2>
              <p>Hi,</p>
              <p>Your order with Order ID <strong>${orderId}</strong> has been successfully placed and confirmed.</p>

              <h3>Order Details:</h3>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <thead>
                  <tr style="background-color: #f4f4f4;">
                    <th style="padding: 10px; text-align: left;">Product</th>
                    <th style="padding: 10px; text-align: center;">Qty</th>
                    <th style="padding: 10px; text-align: right;">Rate</th>
                    <th style="padding: 10px; text-align: right;">Taxable</th>
                    <th style="padding: 10px; text-align: right;">GST</th>
                    <th style="padding: 10px; text-align: right;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="5" style="padding: 10px; text-align: right;">Taxable Value:</td>
                    <td style="padding: 10px; text-align: right;">Rs ${taxableAmount.toFixed(2)}</td>
                  </tr>
                  ${taxSummaryHtml}
                  ${shippingCost > 0 ? `
                  <tr>
                    <td colspan="5" style="padding: 10px; text-align: right;">Shipping:</td>
                    <td style="padding: 10px; text-align: right;">Rs ${shippingCost.toFixed(2)}</td>
                  </tr>` : ''}
                  <tr style="background-color: #f9f9f9; font-weight: bold;">
                    <td colspan="5" style="padding: 15px; text-align: right;">Total Amount Paid:</td>
                    <td style="padding: 15px; text-align: right;">Rs ${orderData.total_amount.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>

              <p><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
              <p>Please find your tax invoice/receipt attached to this email.</p>
              <p>We will notify you once your order is shipped.</p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
              <p style="color: #888; font-size: 12px;">
                Thank you for shopping with TrishikhaOrganics!<br>
                Best regards,<br>
                TrishikhaOrganics Team
              </p>
            </div>
          `,
          text: `Hi,\n\nYour order with Order ID: ${orderId} has been successfully placed and confirmed.\n\nOrder Details:\n${order_items?.map((item: any) => `- ${item.product_name} (Qty: ${item.quantity}) - Rs ${(item.unit_price * item.quantity).toFixed(2)}`).join("\n")}\n\nTaxable Value: Rs ${taxableAmount.toFixed(2)}\nGST @${gstRate}%: Rs ${totalGst.toFixed(2)}${shippingCost > 0 ? `\nShipping: Rs ${shippingCost.toFixed(2)}` : ''}\nTotal Amount Paid: Rs ${orderData.total_amount.toFixed(2)}\nPayment ID: ${razorpay_payment_id}\n\nPlease find your tax invoice/receipt attached.\nWe will notify you once your order is shipped.\n\nThank you for shopping with TrishikhaOrganics!\n\nBest regards,\nTrishikhaOrganics Team`,
          attachments: receiptPdf
            ? [
              {
                filename: `TrishikhaOrganics_Receipt_${orderId.slice(0, 8).toUpperCase()}.pdf`,
                content: receiptPdf,
                contentType: "application/pdf",
              },
            ]
            : [],
        });

        logOrder("webhook_confirmation_email_sent", {
          orderId,
          email: orderData.guest_email,
          receiptAttached: !!receiptPdf,
        });
      } catch (emailError) {
        logError(emailError as Error, {
          orderId,
          step: "webhook_send_confirmation_email",
        });
      }

      break;
    }

    case "payment.failed": {
      const paymentEntity = payload.payload.payment.entity;
      const orderId = paymentEntity.notes?.order_id;

      if (orderId) {
        logPayment("webhook_payment_failed", {
          orderId,
          razorpay_payment_id: paymentEntity.id,
          errorCode: paymentEntity.error_code,
          errorDescription: paymentEntity.error_description,
        });

        await supabase
          .from("orders")
          .update({
            payment_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId)
          .eq("payment_status", "initiated");
      }
      break;
    }

    default:
      logPayment("webhook_unhandled_event", { eventType });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
