import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { supabase } = await requireRole("admin");
        const { id: orderId } = await params;

        if (!orderId) {
            return NextResponse.json({ error: "Order ID required" }, { status: 400 });
        }

        // Get total quantity of items in the order
        const { data, error } = await supabase
            .from("order_items")
            .select("quantity")
            .eq("order_id", orderId);

        if (error) {
            return NextResponse.json({ error: "Failed to fetch order items" }, { status: 500 });
        }

        const totalQuantity = data?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

        return NextResponse.json({ item_count: data?.length || 0, total_quantity: totalQuantity });
    } catch (error) {
        if (error instanceof Error && error.name === "AuthError") {
            return handleAuthError(error);
        }
        console.error("Get order item count error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
