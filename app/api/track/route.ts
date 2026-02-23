import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import shiprocket from "@/utils/shiprocket";
import { trackOrderSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";
import { logOrder, logError, trackSecurityEvent, logSecurityEvent } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchForwardTracking(order: any, orderId: string) {
  const base = { stage: "AWB_ASSIGNED", courier_name: order.courier_name || null };

  try {
    const token = await shiprocket.login();

    if (!token) {
      logError(new Error("Shiprocket login failed for tracking"), { orderId });
      return { ...base, error: "Unable to fetch live tracking data" };
    }

    const trackingRes = await fetch(
      `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.shiprocket_awb_code}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!trackingRes.ok) {
      logError(new Error("Shiprocket tracking fetch failed"), {
        orderId,
        awbCode: order.shiprocket_awb_code,
        status: trackingRes.status,
      });
      return { ...base, error: "Tracking data temporarily unavailable" };
    }

    const tracking = await trackingRes.json();
    return { ...base, tracking: tracking.tracking_data || {} };
  } catch (shiprocketError) {
    logError(shiprocketError as Error, { orderId, step: "shiprocket_tracking" });
    return { ...base, error: "Tracking data temporarily unavailable" };
  }
}

export async function GET(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success, limit, reset, remaining } = await apiRateLimit.limit(ip);

    if (!success) {
      await trackSecurityEvent("rate_limit_exceeded", {
        endpoint: "/api/track",
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

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("order_id");
    const email = searchParams.get("email");

    // Validate input (order_id + email format)
    const validatedData = trackOrderSchema.parse({ order_id: orderId, email });

    // Use service client to bypass RLS for guest tracking
    const supabase = createServiceClient();
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, guest_email, payment_status, shiprocket_awb_code, courier_name, return_status, return_pickup_awb, return_courier_name, created_at, paid_at")
      .eq("id", validatedData.order_id)
      .single();

    if (error) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify email matches order - MANDATORY for security
    if (order.guest_email !== validatedData.email) {
      logSecurityEvent("tracking_email_mismatch", {
        orderId: validatedData.order_id,
        providedEmail: email,
        ip,
      });
      // Return generic error to avoid leaking order existence
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    logOrder("tracking_request", { orderId: validatedData.order_id, ip });

    // DPDP Audit: Log order data access
    await logDataAccess({
      tableName: "orders",
      operation: "SELECT",
      userRole: "guest",
      ip,
      queryType: "single",
      rowCount: 1,
      endpoint: "/api/track",
      reason: "Order tracking - guest accessing own order data",
    });

    // Payment not confirmed yet
    if (order.payment_status !== "paid") {
      return NextResponse.json({ stage: "PAYMENT_NOT_CONFIRMED", created_at: order.created_at });
    }

    // Payment confirmed but AWB not assigned
    if (order.payment_status === "paid" && !order.shiprocket_awb_code) {
      return NextResponse.json({ stage: "PAYMENT_CONFIRMED_AWB_NOT_ASSIGNED", created_at: order.created_at, paid_at: order.paid_at });
    }

    // Return tracking section
    if (order.return_status && order.return_status !== "NOT_REQUESTED") {
      const returnStatusMessages: Record<string, string> = {
        RETURN_REQUESTED: "Return request received. Pickup will be scheduled shortly.",
        RETURN_PICKUP_SCHEDULED: "Return pickup scheduled. Keep the package ready.",
        RETURN_IN_TRANSIT: "Your return is on its way to our warehouse.",
        RETURN_DELIVERED: "Return received. Your refund is being processed.",
        RETURN_REFUND_INITIATED: "Refund initiated. It typically reflects within 5-7 business days or may be more depending on your bank and payment method.",
        RETURN_REFUND_COMPLETED: "Your refund has been processed to your original payment method.",
        RETURN_FAILED: "There was an issue with your return pickup. Our team is working on it.",
      };

      const returnInfo: Record<string, unknown> = {
        return_status: order.return_status,
        return_message: returnStatusMessages[order.return_status] || "Return in progress.",
        return_pickup_awb: order.return_pickup_awb,
        return_courier_name: order.return_courier_name,
      };

      // Fetch live return tracking if AWB exists
      let returnTracking = null;
      if (order.return_pickup_awb) {
        try {
          const token = await shiprocket.login();
          if (token) {
            const returnTrackRes = await fetch(
              `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.return_pickup_awb}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (returnTrackRes.ok) {
              const returnTrackData = await returnTrackRes.json();
              returnTracking = returnTrackData.tracking_data || {};
            }
          }
        } catch (returnTrackErr) {
          logError(returnTrackErr as Error, {
            orderId: validatedData.order_id,
            step: "return_tracking",
          });
        }
      }

      // Include forward tracking alongside return info
      const forwardData = await fetchForwardTracking(order, validatedData.order_id);
      return NextResponse.json({
        ...forwardData,
        returnInfo,
        returnTracking,
      });
    }

    // Forward-only tracking
    const forwardData = await fetchForwardTracking(order, validatedData.order_id);
    return NextResponse.json(forwardData);

  } catch (error) {
    return handleApiError(error, { endpoint: "/api/track" });
  }
}
