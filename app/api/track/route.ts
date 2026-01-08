import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import shiprocket from "@/utils/shiprocket";
import { trackOrderSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";
import { logOrder, logError, logSecurityEvent } from "@/lib/logger";
import { apiRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success, limit, reset, remaining } = await apiRateLimit.limit(ip);

    if (!success) {
      logSecurityEvent("rate_limit_exceeded", {
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

    // Validate input
    const validatedData = trackOrderSchema.parse({ order_id: orderId });

    // Email is required for tracking - prevents unauthorized access
    if (!email) {
      return NextResponse.json(
        { error: "Email is required for order tracking" },
        { status: 400 }
      );
    }

    // Use service client to bypass RLS for guest tracking
    const supabase = createServiceClient();
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", validatedData.order_id)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify email matches order - MANDATORY for security
    if (order.guest_email !== email) {
      logSecurityEvent("tracking_email_mismatch", {
        orderId: validatedData.order_id,
        providedEmail: email,
        ip,
      });
      // Return generic error to avoid leaking order existence
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    logOrder("tracking_request", { orderId: validatedData.order_id, ip });

    // Payment not confirmed yet
    if (order.payment_status !== "paid") {
      return NextResponse.json({
        stage: "PAYMENT_NOT_CONFIRMED",
        order: {
          id: order.id,
          order_status: order.order_status,
          payment_status: order.payment_status,
          created_at: order.created_at,
        },
      });
    }

    // Payment confirmed but AWB not assigned
    if (order.payment_status === "paid" && !order.shiprocket_awb_code) {
      return NextResponse.json({
        stage: "PAYMENT_CONFIRMED_AWB_NOT_ASSIGNED",
        order: {
          id: order.id,
          order_status: order.order_status,
          payment_status: order.payment_status,
          created_at: order.created_at,
        },
      });
    }

    // Fetch real tracking data from Shiprocket
    try {
      const token = await shiprocket.login();

      if (!token) {
        logError(new Error("Shiprocket login failed for tracking"), { orderId: validatedData.order_id });
        return NextResponse.json({
          stage: "AWB_ASSIGNED",
          order: {
            id: order.id,
            order_status: order.order_status,
            shiprocket_awb_code: order.shiprocket_awb_code,
            tracking_url: order.tracking_url,
          },
          error: "Unable to fetch live tracking data",
        });
      }

      const trackingRes = await fetch(
        `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.shiprocket_awb_code}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!trackingRes.ok) {
        logError(new Error("Shiprocket tracking fetch failed"), {
          orderId: validatedData.order_id,
          awbCode: order.shiprocket_awb_code,
          status: trackingRes.status,
        });

        return NextResponse.json({
          stage: "AWB_ASSIGNED",
          order: {
            id: order.id,
            order_status: order.order_status,
            shiprocket_awb_code: order.shiprocket_awb_code,
            tracking_url: order.tracking_url,
          },
          error: "Tracking data temporarily unavailable",
        });
      }

      const tracking = await trackingRes.json();

      return NextResponse.json({
        stage: "AWB_ASSIGNED",
        order: {
          id: order.id,
          order_status: order.order_status,
          shiprocket_awb_code: order.shiprocket_awb_code,
          tracking_url: order.tracking_url,
          created_at: order.created_at,
        },
        tracking: tracking.tracking_data || {},
      });

    } catch (shiprocketError) {
      logError(shiprocketError as Error, {
        orderId: validatedData.order_id,
        step: "shiprocket_tracking",
      });

      return NextResponse.json({
        stage: "AWB_ASSIGNED",
        order: {
          id: order.id,
          order_status: order.order_status,
          shiprocket_awb_code: order.shiprocket_awb_code,
          tracking_url: order.tracking_url,
        },
        error: "Tracking data temporarily unavailable",
      });
    }

  } catch (error) {
    return handleApiError(error, { endpoint: "/api/track" });
  }
}
