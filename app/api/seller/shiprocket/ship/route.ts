import { NextResponse } from "next/server";
import shiprocket from "@/utils/shiprocket";
import { logError, logOrder } from "@/lib/logger";
import { requireRole, handleAuthError } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { adminShippingRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Combined Ship API - Generates Label, Schedules Pickup, and Creates Manifest
 * This simplifies the shipping flow into a single action after AWB assignment
 */
export async function POST(req: Request) {
  try {
    // CSRF protection
    const csrfResult = await requireCsrf(req);
    if (!csrfResult.valid) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 });
    }

    // Rate limiting
    const ip = getClientIp(req);
    const { success } = await adminShippingRateLimit.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Authentication - require admin role
    const { supabase } = await requireRole("admin");

    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json(
        { error: "Missing orderId" },
        { status: 400 }
      );
    }

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, shiprocket_shipment_id, shiprocket_awb_code, shiprocket_label_url, shiprocket_manifest_generated")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Validate prerequisites
    if (!order.shiprocket_shipment_id) {
      return NextResponse.json(
        { error: "Shiprocket shipment not created. Please assign AWB first." },
        { status: 400 }
      );
    }

    if (!order.shiprocket_awb_code) {
      return NextResponse.json(
        { error: "AWB not assigned. Please assign AWB first." },
        { status: 400 }
      );
    }

    // Check if already shipped
    if (order.shiprocket_manifest_generated) {
      return NextResponse.json(
        { error: "Order already shipped (manifest already generated)." },
        { status: 400 }
      );
    }

    const shipmentId = order.shiprocket_shipment_id;
    const results: { label?: string; pickup?: boolean; manifest?: string } = {};

    // Step 1: Generate Label (if not already generated)
    if (!order.shiprocket_label_url) {
      try {
        const labelRes = await shiprocket.generateLabel(shipmentId) as {
          label_url?: string;
          label_created?: number;
          response?: string;
          not_created?: unknown[];
        };

        // Check if label was successfully created
        if (labelRes?.label_created === 1 && labelRes?.label_url) {
          results.label = labelRes.label_url;
          await supabase
            .from("orders")
            .update({ shiprocket_label_url: labelRes.label_url })
            .eq("id", orderId);
          logOrder("label_generated", { orderId, label_url: labelRes.label_url });
        } else if (labelRes?.label_created === 0) {
          // Label generation failed
          const errorMsg = labelRes?.response || "Unknown error";
          logError(new Error(`Label generation failed: ${errorMsg}`), {
            context: "ship_generate_label",
            orderId,
            shipmentId,
            response: labelRes
          });
          return NextResponse.json(
            { error: `Failed to generate label: ${errorMsg}. Please check if AWB is properly assigned in Shiprocket.` },
            { status: 400 }
          );
        } else if (labelRes?.label_url) {
          // Fallback: if label_url exists even without label_created flag
          results.label = labelRes.label_url;
          await supabase
            .from("orders")
            .update({ shiprocket_label_url: labelRes.label_url })
            .eq("id", orderId);
          logOrder("label_generated", { orderId, label_url: labelRes.label_url });
        }
      } catch (err) {
        logError(err as Error, { context: "ship_generate_label", orderId });
        return NextResponse.json(
          { error: "Failed to generate label. Please try again." },
          { status: 500 }
        );
      }
    } else {
      results.label = order.shiprocket_label_url;
    }

    // Step 2: Schedule Pickup
    try {
      const pickupRes = await shiprocket.schedulePickup(shipmentId);
      if (pickupRes?.pickup_scheduled) {
        results.pickup = true;
        await supabase
          .from("orders")
          .update({
            pickup_scheduled_at: new Date().toISOString(),
            shiprocket_status: "PICKUP_SCHEDULED"
          })
          .eq("id", orderId);
        logOrder("pickup_scheduled", { orderId, pickup_data: pickupRes });
      }
    } catch (err) {
      logError(err as Error, { context: "ship_schedule_pickup", orderId });
      // Continue even if pickup scheduling fails - manifest can still be generated
    }

    // Step 3: Generate Manifest
    try {
      const manifestRes = await shiprocket.generateManifestBatch([shipmentId]);
      if (manifestRes?.manifest_url || manifestRes?.url) {
        const manifestUrl = manifestRes.manifest_url || manifestRes.url;
        results.manifest = manifestUrl;

        // Create manifest batch entry
        const { data: batch } = await supabase
          .from("manifest_batches")
          .insert({ manifest_url: manifestUrl })
          .select()
          .single();

        // Update order with manifest URL
        await supabase
          .from("orders")
          .update({
            shiprocket_manifest_generated: true,
            shiprocket_manifest_batch_id: batch?.id,
            shiprocket_manifest_url: manifestUrl,
          })
          .eq("id", orderId);

        logOrder("manifest_generated", { orderId, manifest_url: manifestUrl });
      }
    } catch (err) {
      logError(err as Error, { context: "ship_generate_manifest", orderId });
      return NextResponse.json(
        { error: "Failed to generate manifest. Label was generated but manifest failed." },
        { status: 500 }
      );
    }

    logOrder("order_shipped", { orderId, results });

    return NextResponse.json({
      success: true,
      message: "Order shipped successfully",
      label_url: results.label,
      manifest_url: results.manifest,
    });

  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(err as Error, { endpoint: "/api/seller/shiprocket/ship" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
