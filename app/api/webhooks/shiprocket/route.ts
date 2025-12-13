import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const payload = await req.json();

  const apiKey = req.headers.get("x-api-key");
    const expectedKey = process.env.SHIPROCKET_WEBHOOK_SECRET;

    if (!apiKey || apiKey !== expectedKey) {
      console.error("Invalid Shiprocket Webhook Token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    
  const supabase = await createClient();

  const awb = payload.awb;
  const statusLabel = payload["sr-status-label"];


  await supabase
    .from("orders")
    .update({
      shiprocket_status: statusLabel,
    })
    .eq("shiprocket_awb_code", awb);

  return NextResponse.json({ success: true });
}
