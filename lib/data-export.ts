/**
 * Principal Data Export Builder
 *
 * Single source of truth for the JSON export delivered to a data principal
 * under DPDP Act 2023 §11 (Right to Data Portability). Called by:
 *   - /api/guest/export-data (guest-initiated export)
 *   - processNomineeClaim → executeExportForNominee (nominee-initiated export)
 *
 * Both paths produce byte-for-byte identical exports for the same email
 * (modulo `exportedAt` timestamp).
 */

import { createServiceClient } from "@/utils/supabase/service";

export interface PrincipalDataExport {
  jsonString: string;
  filename: string;
  ordersCount: number;
}

export async function buildPrincipalDataExport(
  email: string
): Promise<PrincipalDataExport> {
  const supabase = createServiceClient();
  const normalizedEmail = email.toLowerCase().trim();

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select(`
      id,
      guest_email,
      guest_phone,
      total_amount,
      currency,
      payment_status,
      order_status,
      shipping_first_name,
      shipping_last_name,
      shipping_address_line1,
      shipping_address_line2,
      shipping_city,
      shipping_state,
      shipping_pincode,
      shipping_country,
      billing_first_name,
      billing_last_name,
      billing_address_line1,
      billing_address_line2,
      billing_city,
      billing_state,
      billing_pincode,
      billing_country,
      reason_for_cancellation,
      created_at,
      updated_at
    `)
    .eq("guest_email", normalizedEmail)
    .not("guest_email", "like", "deleted-%")
    .order("created_at", { ascending: false });

  if (ordersError) {
    throw new Error("Failed to fetch orders");
  }

  const orderIds = orders?.map((o) => o.id) || [];
  let orderItems: Record<string, unknown>[] = [];

  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from("order_items")
      .select(`
        id,
        order_id,
        product_name,
        quantity,
        unit_price,
        created_at
      `)
      .in("order_id", orderIds);

    orderItems = items || [];
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    dataController: {
      name: "Trishikha Organics",
      email: process.env.SUPPORT_EMAIL || "trishikhaorganic@gmail.com",
      address:
        "Plot No 27, Swagat Industrial Area Park, Vill. Dhanot, Kadi Chatral Road, Ta. Kalol, Distt: Gandhi Nagar, Gujarat",
    },
    dataSubject: {
      email: normalizedEmail,
      type: "guest",
    },
    orders:
      orders?.map((order) => ({
        ...order,
        items: orderItems.filter(
          (item: Record<string, unknown>) => item.order_id === order.id
        ),
      })) || [],
    dataRetentionPolicy: {
      orderData:
        "Retained for 8 years for tax compliance (as per CGST Act Section 36 and Income Tax Act)",
      personalData: "Available for deletion upon request (anonymization)",
      paymentData:
        "Handled by Razorpay - see their privacy policy at https://razorpay.com/privacy/",
    },
    yourRights: {
      access: "You have exercised this right by downloading this export",
      correction:
        "Contact us at trishikhaorganic@gmail.com to correct your data",
      deletion: "You can request deletion through the My Data page",
      portability:
        "This export provides your data in machine-readable JSON format",
    },
    legalBasis: "DPDP Act 2023 - Right to Data Portability (Section 11)",
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const filename = `trishikha-data-export-${new Date().toISOString().split("T")[0]}.json`;
  const ordersCount = orders?.length || 0;

  return { jsonString, filename, ordersCount };
}
