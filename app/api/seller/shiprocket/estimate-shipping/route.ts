import shiprocket from "@/utils/shiprocket";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { destination_pincode, cart_items } = await req.json();

  // Calculate total weight of order
  const totalWeight = cart_items.reduce(
    (sum: number, item: any) =>
      sum + ((item.weight || 0.5) * item.quantity),
    0
  );

  try {
    // 1️⃣ Authenticate with Shiprocket
    const token = await shiprocket.login();


    console.log(token);
    // 2️⃣ Call serviceability API
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
    console.log("Shiprocket serviceability response:", data);

    const list = data?.data?.available_courier_companies || [];
    console.log("Available couriers:", list);

    // Sort couriers by price low → high
    list.sort((a: any, b: any) => a.rate - b.rate);

    return NextResponse.json({
      couriers: list.map((c: any) => ({
        name: c.courier_name,
        rate: c.rate,
        etd: c.etd || null,
        id: c.courier_company_id,
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to calculate shipping." },
      { status: 500 }
    );
  }
}
