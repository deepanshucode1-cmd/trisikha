import shiprocket from "@/utils/shiprocket";
import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { shippingEstimateRateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

// Validation schema for shipping estimate request
const shippingEstimateSchema = z.object({
  destination_pincode: z.string().regex(/^\d{6}$/, "Invalid pincode format"),
  cart_items: z.array(z.object({
    weight: z.number().optional(),
    quantity: z.number().int().positive(),
  })).min(1, "Cart must have at least one item"),
});

interface CartItem {
  weight?: number;
  quantity: number;
}

interface CourierCompany {
  courier_name: string;
  rate: number;
  etd?: string;
  courier_company_id: number;
}

export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const { success } = await shippingEstimateRateLimit.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();

    // Validate input
    const parseResult = shippingEstimateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { destination_pincode, cart_items } = parseResult.data;

    // Calculate total weight of order
    const totalWeight = cart_items.reduce(
      (sum: number, item: CartItem) =>
        sum + ((item.weight || 0.5) * item.quantity),
      0
    );

    // Authenticate with Shiprocket
    const token = await shiprocket.login();

    // Call serviceability API
    const srRes = await fetch(
      `https://apiv2.shiprocket.in/v1/external/courier/serviceability?pickup_postcode=${process.env.STORE_PINCODE}&delivery_postcode=${destination_pincode}&weight=${totalWeight}&cod=0`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await srRes.json();
    const list: CourierCompany[] = data?.data?.available_courier_companies || [];

    // Sort couriers by price low → high
    list.sort((a, b) => a.rate - b.rate);

    return NextResponse.json({
      couriers: list.map((c) => ({
        name: c.courier_name,
        rate: c.rate,
        etd: c.etd || null,
        id: c.courier_company_id,
      })),
    });
  } catch (err) {
    logError(err as Error, { endpoint: "/api/seller/shiprocket/estimate-shipping" });
    return NextResponse.json(
      { error: "Failed to calculate shipping." },
      { status: 500 }
    );
  }
}
