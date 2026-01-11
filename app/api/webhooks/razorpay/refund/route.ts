import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/utils/supabase/service";
import { logSecurityEvent, logError } from "@/lib/logger";
import { generateCreditNoteNumber, generateCreditNotePDF } from "@/lib/creditNote";
import { sendCreditNote } from "@/lib/email";

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

function verifySignature(body: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Safely extract refund entity from common Razorpay webhook shapes.
 * Common path: payload.payload.refund.entity
 * Some variations might nest differently — we check multiple places defensively.
 */
function extractRefundEntity(payload: any) {
  if (!payload) return null;

  // Standard shape: payload.payload.refund.entity
  if (payload.payload?.refund?.entity) return payload.payload.refund.entity;

  // Sometimes payload.refund.entity (rare)
  if (payload.refund?.entity) return payload.refund.entity;

  // Some webhooks include refund directly as payload.entity
  if (payload.entity && payload.entity.type === "refund") return payload.entity;

  // Fallback: if event is refund.* and payload contains nested objects, try to find keys named 'refund' or with 'status' + 'payment_id'
  // Walk limited depth for safety

  return null;
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    // verify signature - CRITICAL: reject invalid signatures
    if (!verifySignature(rawBody, signature)) {
      logSecurityEvent("invalid_webhook_signature", {
        endpoint: "/api/webhooks/razorpay/refund",
        hasSignature: !!signature,
      });
      return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);

    // defensive extraction
    const refund = extractRefundEntity(payload);
    if (!refund) {
      // Nothing to do: not a refund payload or unknown shape
      logSecurityEvent("refund_entity_not_found", {
        endpoint: "/api/webhooks/razorpay/refund",
        event: payload?.event,
      });
      return NextResponse.json({ ok: true });
    }

    const payment = payload.payload?.payment?.entity || null;

    // Extract commonly used fields safely
    const refundId: string | undefined = refund.id;
    const paymentId: string | undefined = refund.payment_id;
    const status: string | undefined = (refund.status || "").toString(); // created | processed | failed
    const errorReason: string | undefined = payment.error_reason;
    const errorDescription: string | undefined = payment.error_description;
    // Amount is in smallest currency unit (paise)
    const refundAmount = refund.amount ? refund.amount / 100 : undefined;

    const supabase = createServiceClient();

    // Try to find order by razorpay_refund_id first (idempotency), then by payment_id
    let orderQuery = supabase.from("orders").select("*").limit(1);
    if (refundId) {
      orderQuery = orderQuery.eq("refund_id", refundId);
    }
    let { data: orders, error: fetchErr } = await orderQuery;

    // If not found by refund id, lookup by payment id
    let order: any = orders && orders.length ? orders[0] : null;
    if (!order && paymentId) {
      const { data: ordersByPayment, error: err2 } = await supabase
        .from("orders")
        .select("*")
        .eq("payment_id", paymentId)
        .limit(1);
      fetchErr = err2 || fetchErr;
      order = ordersByPayment && ordersByPayment.length ? ordersByPayment[0] : null;
    }

    if (fetchErr) {
      logError(new Error("Supabase error while finding order for refund webhook"), { error: fetchErr });
      // still return 200 to avoid retries from Razorpay — but log/alert in production
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    if (!order) {
      // Might be a refund for a payment we don't have (ignore)
      logSecurityEvent("no_matching_order_for_refund", { paymentId, refundId });
      return NextResponse.json({ ok: true });
    }

    // Map Razorpay status -> your DB columns
    // We'll update: refund_status, payment_status, cancellation_status, razorpay_refund_id, refund error fields
    const updates: Record<string, any> = { refund_id: refundId || order.refund_id };

    if (status === "created") {
      updates.refund_status = "REFUND_INITIATED"; // refund created in Razorpay
    } else if (status === "processed" || status === "completed" || status === "succeeded") {
      // processed = refund successful
      updates.refund_status = "REFUND_COMPLETED";
      updates.payment_status = "refunded";
      updates.cancellation_status = "CANCELLED";
      updates.order_status = "CANCELLED";
      if (refundAmount) updates.refund_amount = refundAmount;

      // Generate and send credit note if not already sent
      if (!order.credit_note_sent_at) {
        try {
          const { data: orderItems } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', order.id);

          if (orderItems && orderItems.length > 0) {
            // Step 1: Generate credit note number first
            const creditNoteNo = await generateCreditNoteNumber();
            updates.credit_note_number = creditNoteNo;
            // NOTE: credit_note_sent_at is set ONLY after successful email send

            // Step 2: Prepare order object for PDF (merge existing + updates)
            const orderForPdf = {
              ...order,
              ...updates,
              refund_amount: refundAmount || order.total_amount,
              guest_email: order.guest_email
            };

            // Step 3: Generate PDF
            const pdfBuffer = await generateCreditNotePDF(orderForPdf, orderItems);

            // Step 4: Send email
            const emailSent = await sendCreditNote(
              order.guest_email,
              order.id,
              creditNoteNo,
              orderForPdf.refund_amount,
              pdfBuffer
            );

            // Step 5: Only mark as sent if email was successful
            if (emailSent) {
              updates.credit_note_sent_at = new Date().toISOString();
            }
          }
        } catch (cnError) {
          logError(cnError as Error, { context: "webhook_credit_note_generation_failed", orderId: order.id });
          // Don't set credit_note_sent_at - allows retry on next webhook
        }
      }

    } else if (status === "failed") {
      updates.refund_status = "REFUND_FAILED";
      updates.refund_error_reason = errorReason || null;
      updates.refund_error_description = errorDescription || null;
    } else {
      // unknown/other statuses: store raw status
      updates.refund_status = (status || "unknown").toUpperCase();
    }

    // store error info if present
    if (errorReason && !updates.refund_error_reason) updates.refund_error_reason = errorReason;
    if (errorDescription && !updates.refund_error_description) updates.refund_error_description = errorDescription;

    // Persist updates
    const { error: updateErr } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", order.id);

    if (updateErr) {
      logError(new Error("Supabase error updating order from refund webhook"), { error: updateErr, orderId: order.id });
      // still return 200 to Razorpay, but log the error for manual reconciliation
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err as Error, { endpoint: "/api/webhooks/razorpay/refund" });
    // respond 200 so Razorpay does not keep retrying if you already logged/alerted
    return NextResponse.json({ error: "handler_error" }, { status: 200 });
  }
}
