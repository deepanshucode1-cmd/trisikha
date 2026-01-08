import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/utils/supabase/server";
import { sendOrderDelivered, sendOrderShipped } from "@/lib/email";
import { logSecurityEvent, logOrder, logError } from "@/lib/logger";

// Timing-safe string comparison to prevent timing attacks
function timingSafeCompare(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    const apiKey = req.headers.get("x-api-key");
    const expectedKey = process.env.SHIPROCKET_WEBHOOK_SECRET;

    if (!apiKey || !expectedKey || !timingSafeCompare(apiKey, expectedKey)) {
      logSecurityEvent("invalid_shiprocket_webhook_token", {
        endpoint: "/api/webhooks/shiprocket",
        hasApiKey: !!apiKey,
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    const awb = payload.awb;
    const statusLabel = payload["sr-status-label"];

    if (statusLabel === undefined || awb === undefined) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 200 });
    }

    if (statusLabel === "Delivered") {
      await supabase
        .from("orders")
        .update({
          shiprocket_status: statusLabel,
          order_status: "DELIVERED",
        })
        .eq("shiprocket_awb_code", awb);

      const { data: order_data, error: order_error } = await supabase
        .from("orders")
        .select("id, guest_email")
        .eq("shiprocket_awb_code", awb)
        .single();

      if (order_error || !order_data) {
        logError(new Error("Order not found for delivery webhook"), { awb });
        return NextResponse.json({ error: "Order not found" }, { status: 200 });
      }

      await sendOrderDelivered(order_data.guest_email, order_data.id);
      logOrder("order_delivered", { orderId: order_data.id, awb });

    } else if (statusLabel === "PICKED UP") {
      await supabase
        .from("orders")
        .update({
          shiprocket_status: statusLabel,
          order_status: "PICKED_UP",
        })
        .eq("shiprocket_awb_code", awb);

      const { data: order_data, error: order_error } = await supabase
        .from("orders")
        .select("id, guest_email, tracking_url")
        .eq("shiprocket_awb_code", awb)
        .single();

      if (order_error || !order_data) {
        logError(new Error("Order not found for pickup webhook"), { awb });
        return NextResponse.json({ error: "Order not found" }, { status: 200 });
      }

      await sendOrderShipped(order_data.guest_email, order_data.id, order_data.tracking_url);
      logOrder("order_shipped", { orderId: order_data.id, awb });

    } else {
      await supabase
        .from("orders")
        .update({
          shiprocket_status: statusLabel,
        })
        .eq("shiprocket_awb_code", awb);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error as Error, { endpoint: "/api/webhooks/shiprocket" });
    return NextResponse.json({ error: "Internal error" }, { status: 200 });
  }
}
