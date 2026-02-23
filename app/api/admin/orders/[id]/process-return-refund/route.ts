/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createServiceClient } from "@/utils/supabase/service";
import { requireRole, handleAuthError } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { handleApiError } from "@/lib/errors";
import { processReturnRefundSchema } from "@/lib/validation";
import { sanitizeObject } from "@/lib/xss";
import { logOrder, logPayment, logError } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import { generateCreditNoteNumber, generateCreditNotePDF } from "@/lib/creditNote";
import { sendCreditNote, sendReturnRefundProcessed } from "@/lib/email";
import {
  validatePhoto,
  validatePhotoCount,
  uploadInspectionPhoto,
  getInspectionPhotoUrl,
} from "@/lib/return-inspection-storage";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/**
 * POST /api/admin/orders/[id]/process-return-refund
 *
 * Admin inspects a returned product and processes the refund.
 * Accepts multipart form data with product condition, optional deduction, and photos.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfResult = await requireCsrf(req);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

    const { user } = await requireRole("admin");
    const { id: orderId } = await params;

    if (!orderId) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const rawFields = {
      product_condition: formData.get("product_condition") as string,
      admin_note: formData.get("admin_note") as string | null,
      deduction_amount: formData.get("deduction_amount") as string | null,
    };

    // Validate with Zod
    const validated = processReturnRefundSchema.parse({
      product_condition: rawFields.product_condition,
      admin_note: rawFields.admin_note || undefined,
      deduction_amount: rawFields.deduction_amount || 0,
    });
    const sanitized = sanitizeObject(validated);

    const { product_condition, deduction_amount } = sanitized;
    const admin_note = sanitized.admin_note as string | undefined;
    const hasDeduction = product_condition !== "good_condition";

    // Validate admin_note is required when condition is not good
    if (hasDeduction && (!admin_note || admin_note.trim().length < 10)) {
      return NextResponse.json(
        { error: "Admin note is required (min 10 characters) when product condition is not good." },
        { status: 400 }
      );
    }

    // Extract and validate photos
    const photos: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "photos" && value instanceof File) {
        photos.push(value);
      }
    }

    // Validate photo count
    const photoCountResult = validatePhotoCount(photos.length, hasDeduction);
    if (!photoCountResult.valid) {
      return NextResponse.json({ error: photoCountResult.error }, { status: 400 });
    }

    // Validate each photo
    const photoBuffers: { buffer: Buffer; contentType: string }[] = [];
    for (const photo of photos) {
      const buffer = Buffer.from(await photo.arrayBuffer());
      const contentType = photo.type;

      const photoResult = validatePhoto(buffer, contentType);
      if (!photoResult.valid) {
        return NextResponse.json({ error: photoResult.error }, { status: 400 });
      }

      photoBuffers.push({ buffer, contentType });
    }

    const supabase = createServiceClient();

    // Fetch order and guard status
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("return_status", "RETURN_DELIVERED")
      .single();

    if (fetchError || !order) {
      return NextResponse.json(
        { error: "Order not found or not in RETURN_DELIVERED status." },
        { status: 400 }
      );
    }

    // Validate deduction amount
    const maxRefund = order.return_refund_amount || 0;
    if (deduction_amount > maxRefund) {
      return NextResponse.json(
        { error: `Deduction amount (₹${deduction_amount}) cannot exceed the refund amount (₹${maxRefund}).` },
        { status: 400 }
      );
    }

    const finalRefundAmount = Math.max(0, maxRefund - deduction_amount);

    // Upload photos to Supabase Storage
    const uploadedPaths: string[] = [];
    for (const { buffer, contentType } of photoBuffers) {
      const { path } = await uploadInspectionPhoto({
        file: buffer,
        contentType,
        orderId,
      });
      uploadedPaths.push(path);
    }

    logOrder("return_refund_processing", {
      orderId,
      adminId: user.id,
      product_condition,
      deduction_amount,
      finalRefundAmount,
      photoCount: uploadedPaths.length,
    });

    // Initiate Razorpay refund
    let razorpayResult: any;
    try {
      razorpayResult = await razorpay.payments.refund(order.payment_id, {
        amount: Math.round(finalRefundAmount * 100), // paise
      });
    } catch (refundErr: any) {
      // Mark as refund initiated so retry is possible
      await supabase.from("orders").update({
        return_status: "RETURN_REFUND_INITIATED",
        refund_status: "REFUND_FAILED",
        refund_error_code: refundErr?.error?.code ?? "UNKNOWN",
        refund_error_reason: refundErr?.error?.reason ?? "",
        refund_error_description: refundErr?.error?.description ?? "",
        return_admin_note: admin_note || null,
        return_deduction_amount: deduction_amount,
        return_deduction_reason: hasDeduction ? product_condition : null,
        return_inspection_photos: uploadedPaths.length > 0 ? uploadedPaths : null,
      }).eq("id", orderId);

      logPayment("return_refund_failed", {
        orderId,
        error: refundErr?.error?.description || refundErr?.message,
        adminId: user.id,
      });

      return NextResponse.json({ error: "Razorpay refund failed. Retry via cancellation retry." }, { status: 500 });
    }

    if (!razorpayResult || razorpayResult.status !== "processed" || !razorpayResult.amount) {
      // Unexpected state — save what we can
      await supabase.from("orders").update({
        return_status: "RETURN_REFUND_INITIATED",
        refund_status: "REFUND_FAILED",
        return_admin_note: admin_note || null,
        return_deduction_amount: deduction_amount,
        return_deduction_reason: hasDeduction ? product_condition : null,
        return_inspection_photos: uploadedPaths.length > 0 ? uploadedPaths : null,
      }).eq("id", orderId);

      logPayment("return_refund_unexpected_status", {
        orderId,
        status: razorpayResult?.status,
        adminId: user.id,
      });

      return NextResponse.json({ error: "Refund status unexpected. Please check Razorpay dashboard." }, { status: 500 });
    }

    const actualRefundAmount = razorpayResult.amount / 100;

    // Generate credit note
    let creditNoteNo: string | null = null;
    try {
      creditNoteNo = await generateCreditNoteNumber();
    } catch (e) {
      logError(e as Error, { context: "return_refund_credit_note_gen_failed", orderId });
    }

    // Update order with all return refund details
    const { data: updatedOrder, error: updateError } = await supabase.from("orders").update({
      return_status: "RETURN_REFUND_COMPLETED",
      refund_status: "REFUND_COMPLETED",
      payment_status: "refunded",
      order_status: "RETURNED",
      refund_id: razorpayResult.id,
      refund_amount: actualRefundAmount,
      refund_initiated_at: new Date().toISOString(),
      refund_completed_at: new Date().toISOString(),
      return_admin_note: admin_note || null,
      return_deduction_amount: deduction_amount,
      return_deduction_reason: hasDeduction ? product_condition : null,
      return_inspection_photos: uploadedPaths.length > 0 ? uploadedPaths : null,
      credit_note_number: creditNoteNo,
    }).eq("id", orderId).select("*");

    if (updateError) {
      logError(new Error(updateError.message), { context: "return_refund_update_failed", orderId });
    }

    logPayment("return_refund_completed", {
      orderId,
      refundId: razorpayResult.id,
      amount: actualRefundAmount,
      deduction: deduction_amount,
      condition: product_condition,
      adminId: user.id,
      creditNoteNumber: creditNoteNo,
    });

    // DPDP Audit
    const ip = getClientIp(req);
    await logDataAccess({
      tableName: "orders",
      operation: "UPDATE",
      userId: user.id,
      userRole: "admin",
      ip,
      queryType: "single",
      rowCount: 1,
      endpoint: `/api/admin/orders/${orderId}/process-return-refund`,
      reason: `Admin processed return refund - condition: ${product_condition}, deduction: ${deduction_amount}`,
      oldData: { orderId, previousReturnStatus: "RETURN_DELIVERED" },
      newData: { orderId, newStatus: "RETURNED", refundAmount: actualRefundAmount, deduction: deduction_amount },
    });

    // Generate and send credit note + refund notification email
    if (creditNoteNo && updatedOrder && updatedOrder[0]) {
      try {
        const { data: orderItems } = await supabase
          .from("order_items")
          .select("*")
          .eq("order_id", orderId);

        if (orderItems && orderItems.length > 0) {
          const pdfBuffer = await generateCreditNotePDF(updatedOrder[0], orderItems);
          const emailSent = await sendCreditNote(
            order.guest_email,
            orderId,
            creditNoteNo,
            actualRefundAmount,
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
        logError(cnErr as Error, { context: "return_credit_note_email_failed", orderId });
      }
    }

    // Also send return refund processed email (separate from credit note)
    try {
      await sendReturnRefundProcessed(
        order.guest_email,
        orderId,
        actualRefundAmount,
        razorpayResult.id
      );
    } catch (emailErr) {
      logError(emailErr as Error, { context: "return_refund_email_failed", orderId });
    }

    // Generate signed URLs for response
    const photoSignedUrls: string[] = [];
    for (const path of uploadedPaths) {
      try {
        const { signedUrl } = await getInspectionPhotoUrl(path);
        photoSignedUrls.push(signedUrl);
      } catch {
        // Non-critical
      }
    }

    return NextResponse.json({
      success: true,
      refundAmount: actualRefundAmount,
      refundId: razorpayResult.id,
      deductionAmount: deduction_amount,
      creditNoteNumber: creditNoteNo,
      inspectionPhotos: photoSignedUrls,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return handleAuthError(error);
    }
    return handleApiError(error, { endpoint: "/api/admin/orders/[id]/process-return-refund" });
  }
}
