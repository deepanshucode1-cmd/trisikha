import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import shiprocket from "@/utils/shiprocket"; // your helper wrapper

export async function POST(req: Request) {
  try {
    const { order_ids } = await req.json();

    if (!order_ids || !Array.isArray(order_ids)) {
      return NextResponse.json(
        { error: "order_ids must be an array" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

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

    // 2. Ensure AWBs exist
    for (const order of orders) {
      if (order.shiprocket_manifest_generated) continue;
      if(order.shiprocket_shipment_id===null){
        shiprocket_order_not_created.push(order.id);
        continue;
      }
      shipment_ids.push(order.shiprocket_shipment_id);
    }

    if(shiprocket_order_not_created.length>0){
      return NextResponse.json(
        { error: `Shiprocket order not created for orders: ${shiprocket_order_not_created.join(", ")}` },
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

    return NextResponse.json({
      success: true,
      manifest: batch,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
