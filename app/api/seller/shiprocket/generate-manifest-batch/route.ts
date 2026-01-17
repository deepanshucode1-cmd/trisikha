import { NextResponse } from "next/server";
import shiprocket from "@/utils/shiprocket";
import { logError, logOrder } from "@/lib/logger";
import { requireRole, handleAuthError } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { adminShippingRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    // CSRF protection for admin routes
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

    const { order_ids } = await req.json();

    if (!order_ids || !Array.isArray(order_ids)) {
      return NextResponse.json(
        { error: "order_ids must be an array" },
        { status: 400 }
      );
    }

    // 1. Fetch orders
    const { data: orders } = await supabase
      .from("orders")
      .select("id, shiprocket_awb_code, shiprocket_manifest_generated,shiprocket_shipment_id")
      .in("id", order_ids);

    if (!orders?.length) {
      return NextResponse.json(
        { error: "No valid orders found" },
        { status: 404 }
      );
    }

    const shipment_ids: string[] = [];
    const shiprocket_order_not_created: string[] = [];
    const awb_not_assigned: string[] = [];

    // 2. Ensure orders are registered and AWBs are assigned
    for (const order of orders) {
      if (order.shiprocket_manifest_generated) continue;
      if (order.shiprocket_shipment_id === null) {
        shiprocket_order_not_created.push(order.id);
        continue;
      }
      if (!order.shiprocket_awb_code) {
        awb_not_assigned.push(order.id);
        continue;
      }
      shipment_ids.push(order.shiprocket_shipment_id);
    }

    if (shiprocket_order_not_created.length > 0) {
      return NextResponse.json(
        { error: `Shiprocket order not created for orders: ${shiprocket_order_not_created.join(", ")}. Please assign AWB first.` },
        { status: 400 }
      );
    }

    if (awb_not_assigned.length > 0) {
      return NextResponse.json(
        { error: `AWB not assigned for orders: ${awb_not_assigned.join(", ")}. AWB assignment may be pending - please retry.` },
        { status: 400 }
      );
    }

    if (shipment_ids.length === 0) {
      return NextResponse.json(
        { error: "All selected orders already manifested." },
        { status: 400 }
      );
    }


    // 3. Generate Manifest Batch
    const manifest = await shiprocket.generateManifestBatch(shipment_ids);

    // manifest returns e.g.:
    // { manifest_id: 98765, url: "..." }

    // 4. Insert manifest batch entry
    const { data: batch } = await supabase
      .from("manifest_batches")
      .insert({
        manifest_url: manifest.url,
      })
      .select()
      .single();

    // 5. Update orders
    await supabase
      .from("orders")
      .update({
        shiprocket_manifest_generated: true,
        shiprocket_manifest_batch_id: batch.id,
      })
      .in("id", order_ids);

    logOrder("manifest_generated", { order_ids, manifest_id: batch.id, manifest_url: batch.manifest_url });

    return NextResponse.json({
      success: true,
      manifest: batch,
    });
  } catch (err) {
    // Handle auth errors specifically
    const authResponse = handleAuthError(err);
    if (authResponse.status !== 500) {
      return authResponse;
    }

    logError(err as Error, { endpoint: "/api/seller/shiprocket/generate-manifest-batch" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
