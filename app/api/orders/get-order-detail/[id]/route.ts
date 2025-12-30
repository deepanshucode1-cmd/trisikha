// app/api/orders/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {id} =  await params;

  const { data: orderData, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

  const { data: itemData, error: itemErr } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id);

  return NextResponse.json({
    order: orderData,
    items: itemData || []
  });
}
