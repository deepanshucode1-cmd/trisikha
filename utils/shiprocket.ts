// lib/shiprocket.ts

import { logError, logOrder } from "@/lib/logger";
import retry from "@/utils/retry";
import { SupabaseClient } from "@supabase/supabase-js";

let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

async function login(): Promise<string> {
  if (
    cachedToken &&
    tokenExpiry &&
    Date.now() < tokenExpiry - 60 * 1000 // refresh 1 min before expiry
  ) {
    return cachedToken;
  }

  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;

  if (!email || !password) {
    throw new Error("Shiprocket credentials not configured");
  }

  return retry(async () => {
    const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      logError(new Error("Shiprocket authentication failed"), { response: data });
      throw new Error(data.message || "Unable to authenticate with shipping partner");
    }

    cachedToken = data.token as string;
    tokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    return cachedToken!;
  }, 3, 1000);
}

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

async function authedFetch(url: string, options: FetchOptions = {}): Promise<unknown> {
  const token = await login();

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await res.json();
  if (!res.ok) {
    logError(new Error("Shiprocket API request failed"), { url, response: data });
    throw new Error(data.message || JSON.stringify(data));
  }

  return data;
}

// -----------------------------------------------------
// Shiprocket API Response Types
// -----------------------------------------------------
interface LabelResponse {
  label_url?: string;
  label_created?: number;
  not_created?: unknown[];
}

interface ManifestResponse {
  manifest_url?: string;
  url?: string;
  status?: string;
}

interface PickupResponse {
  pickup_scheduled_date?: string;
  pickup_scheduled?: number;
  pickup_token_number?: string;
  status?: number;
}

interface AWBResponse {
  awb_assign_status?: number;
  response?: {
    data?: {
      awb_code?: string;
      courier_name?: string;
    };
  };
  message?: string;
}

interface CancelResponse {
  status?: string;
  message?: string;
}

// -----------------------------------------------------
// 📦 CREATE LABEL
// -----------------------------------------------------
export async function generateLabel(shipmentId: string | number): Promise<LabelResponse> {
  // Shiprocket expects shipment_id as an array of numbers
  const numericId = typeof shipmentId === 'string' ? parseInt(shipmentId, 10) : shipmentId;
  return authedFetch(
    "https://apiv2.shiprocket.in/v1/external/courier/generate/label",
    {
      method: "POST",
      body: JSON.stringify({ shipment_id: [numericId] }),
    }
  ) as Promise<LabelResponse>;
}

interface RetryAssignAWBParams {
  token: string;
  shipmentId: number;
  orderId: string;
  shiprocket_order_id: string;
  maxRetries?: number;
  supabase: SupabaseClient;
}

interface AWBResult {
  success: boolean;
  result?: unknown;
  error?: unknown;
}

export async function retryAssignAWB({
  token,
  shipmentId,
  maxRetries = 3,
  orderId,
  shiprocket_order_id,
  supabase
}: RetryAssignAWBParams): Promise<AWBResult> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const res = await fetch(
        "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ shipment_id: [shipmentId] }),
        }
      );

      const result = await res.json();

      // If AWB assignment succeeded
      if (result?.awb_assign_status === 1) {
        const { error } = await supabase
          .from("orders")
          .update({
            shiprocket_awb_code: result.response.data.awb_code,
            shiprocket_status: "AWB_ASSIGNED",
            shiprocket_shipment_id: shipmentId,
            shiprocket_order_id: shiprocket_order_id
          })
          .eq("id", orderId);

        if (error) {
          logError(new Error("Failed to update order with AWB"), { orderId, error });
        }

        logOrder("awb_assigned", { orderId, shipmentId, awbCode: result.response.data.awb_code });
        return { success: true, result };
      }

      throw new Error(result?.message || "Failed to assign AWB");

    } catch (err) {
      logError(err as Error, { orderId, shipmentId, attempt: attempt + 1 });
      attempt++;

      if (attempt >= maxRetries) {
        // Keep NOT_SHIPPED status but store shipment IDs so we can retry AWB assignment
        // Note: NOT_SHIPPED with shipment_id but no awb_code = AWB pending
        await supabase
          .from("orders")
          .update({
            shiprocket_shipment_id: shipmentId,
            shiprocket_order_id: shiprocket_order_id
          })
          .eq("id", orderId);

        return { success: false, error: err };
      }

      const delay = 2000 * attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { success: false, error: new Error("Max retries exceeded") };
}


// -----------------------------------------------------
// 🧾 CREATE MANIFEST (Batch)
// -----------------------------------------------------
export async function generateManifestBatch(shipmentIds: (string | number)[]): Promise<ManifestResponse> {
  // Shiprocket expects shipment_id as an array of numbers
  const numericIds = shipmentIds.map(id => typeof id === 'string' ? parseInt(id, 10) : id);
  return authedFetch(
    "https://apiv2.shiprocket.in/v1/external/manifests/generate",
    {
      method: "POST",
      body: JSON.stringify({ shipment_id: numericIds }),
    }
  ) as Promise<ManifestResponse>;
}

// -----------------------------------------------------
// 🧾 CREATE MANIFEST (Single order – rarely used)
// -----------------------------------------------------
export async function generateManifest(shipmentId: string | number): Promise<ManifestResponse> {
  return generateManifestBatch([shipmentId]);
}

// -----------------------------------------------------
// 🖨 PRINT MANIFEST (download/view later)
// -----------------------------------------------------
export async function printManifest(manifestId: number | string): Promise<ManifestResponse> {
  return authedFetch(
    `https://apiv2.shiprocket.in/v1/external/manifests/print?manifest_ids[]=${manifestId}`,
    {
      method: "GET",
    }
  ) as Promise<ManifestResponse>;
}

// -----------------------------------------------------
// 🚚 SCHEDULE PICKUP
// -----------------------------------------------------
export async function schedulePickup(shipmentId: string | number): Promise<PickupResponse> {
  // Shiprocket expects shipment_id as an array of numbers
  const numericId = typeof shipmentId === 'string' ? parseInt(shipmentId, 10) : shipmentId;
  return authedFetch(
    "https://apiv2.shiprocket.in/v1/external/courier/generate/pickup",
    {
      method: "POST",
      body: JSON.stringify({ shipment_id: [numericId] }),
    }
  ) as Promise<PickupResponse>;
}

export async function generateAWB(shipmentId: string): Promise<AWBResponse> {
  return authedFetch(
    "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
    {
      method: "POST",
      body: JSON.stringify({
        shipment_id: shipmentId
      }),
    }
  ) as Promise<AWBResponse>;
}

export async function cancelShipment(orderId: string): Promise<CancelResponse> {
  return authedFetch(
    "https://apiv2.shiprocket.in/v1/external/orders/cancel",
    {
      method: "POST",
      body: JSON.stringify({
        ids: [orderId]
      }),
    }
  ) as Promise<CancelResponse>;
}

// -----------------------------------------------------
// 💰 GET RETURN SHIPPING RATE
// -----------------------------------------------------
interface ReturnShippingRateParams {
  pickupPincode: string;      // Customer's pincode (where return pickup happens)
  deliveryPincode: string;    // Warehouse pincode (where return is delivered)
  weight: number;             // Weight in kg
  length: number;             // Length in cm
  breadth: number;            // Breadth in cm
  height: number;             // Height in cm
  codAmount?: number;         // COD amount (0 for prepaid returns)
}

interface CourierRate {
  courier_company_id: number;
  courier_name: string;
  freight_charge: number;
  rate: number;
  cod_charges?: number;
  estimated_delivery_days?: string;
}

interface ServiceabilityResponse {
  status?: number;
  data?: {
    available_courier_companies?: CourierRate[];
  };
  message?: string;
}

export async function getReturnShippingRate(params: ReturnShippingRateParams): Promise<number> {
  const {
    pickupPincode,
    deliveryPincode,
    weight,
    length,
    breadth,
    height,
    codAmount = 0,
  } = params;

  try {
    return await retry(async () => {
      const queryParams = new URLSearchParams({
        pickup_postcode: pickupPincode,
        delivery_postcode: deliveryPincode,
        weight: weight.toString(),
        length: length.toString(),
        breadth: breadth.toString(),
        height: height.toString(),
        cod: codAmount > 0 ? "1" : "0",
        declared_value: codAmount.toString(),
      });

      const response = await authedFetch(
        `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?${queryParams.toString()}`,
        { method: "GET" }
      ) as ServiceabilityResponse;

      if (response.data?.available_courier_companies && response.data.available_courier_companies.length > 0) {
        const rates = response.data.available_courier_companies;
        const cheapestRate = rates.reduce((min, courier) =>
          courier.rate < min.rate ? courier : min
          , rates[0]);

        logOrder("return_shipping_rate_fetched", {
          pickupPincode,
          deliveryPincode,
          weight,
          cheapestCourier: cheapestRate.courier_name,
          rate: cheapestRate.rate,
        });

        return cheapestRate.rate;
      }

      throw new Error("No couriers are currently available for return shipping to this location. Please try again or file a grievance.");
    }, 3, 1000);
  } catch (error) {
    logError(error as Error, {
      context: "get_return_shipping_rate_failed",
      pickupPincode,
      deliveryPincode,
    });
    throw error;
  }
}

//----------------------------------------------------
// 🔄 CREATE RETURN ORDER
// -----------------------------------------------------
interface ReturnOrderParams {
  orderId: string;
  shiprocket_order_id: string;
  shiprocket_shipment_id: string;
  order_date: string;
  channel_id?: number;
  pickup_customer_name: string;
  pickup_last_name?: string;
  pickup_address: string;
  pickup_address_2?: string;
  pickup_city: string;
  pickup_state: string;
  pickup_country: string;
  pickup_pincode: string;
  pickup_email: string;
  pickup_phone: string;
  shipping_customer_name: string;
  shipping_last_name?: string;
  shipping_address: string;
  shipping_address_2?: string;
  shipping_city: string;
  shipping_state: string;
  shipping_country: string;
  shipping_pincode: string;
  shipping_email?: string;
  shipping_phone: string;
  order_items: Array<{
    name: string;
    sku: string;
    units: number;
    selling_price: number;
    qc_enable?: boolean;
  }>;
  payment_method: "COD" | "Prepaid";
  total_discount?: number;
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
}

interface ReturnOrderResponse {
  order_id?: number;
  shipment_id?: number;
  awb_code?: string;
  courier_company_id?: number;
  courier_name?: string;
  status?: string;
  message?: string;
}

export async function createReturnOrder(params: ReturnOrderParams): Promise<ReturnOrderResponse> {
  const channelId = params.channel_id || parseInt(process.env.SHIPROCKET_CHANNEL_ID || "0");

  const payload = {
    order_id: params.shiprocket_order_id,
    order_date: params.order_date,
    channel_id: channelId,
    pickup_customer_name: params.pickup_customer_name,
    pickup_last_name: params.pickup_last_name || "",
    pickup_address: params.pickup_address,
    pickup_address_2: params.pickup_address_2 || "",
    pickup_city: params.pickup_city,
    pickup_state: params.pickup_state,
    pickup_country: params.pickup_country,
    pickup_pincode: params.pickup_pincode,
    pickup_email: params.pickup_email,
    pickup_phone: params.pickup_phone,
    shipping_customer_name: params.shipping_customer_name,
    shipping_last_name: params.shipping_last_name || "",
    shipping_address: params.shipping_address,
    shipping_address_2: params.shipping_address_2 || "",
    shipping_city: params.shipping_city,
    shipping_state: params.shipping_state,
    shipping_country: params.shipping_country,
    shipping_pincode: params.shipping_pincode,
    shipping_email: params.shipping_email || "",
    shipping_phone: params.shipping_phone,
    order_items: params.order_items.map(item => ({
      name: item.name,
      sku: item.sku,
      units: item.units,
      selling_price: item.selling_price,
      qc_enable: item.qc_enable ?? true,
    })),
    payment_method: params.payment_method,
    total_discount: params.total_discount || 0,
    sub_total: params.sub_total,
    length: params.length,
    breadth: params.breadth,
    height: params.height,
    weight: params.weight,
  };

  logOrder("creating_return_order", { orderId: params.orderId, shiprocketOrderId: params.shiprocket_order_id });

  return authedFetch(
    "https://apiv2.shiprocket.in/v1/external/orders/create/return",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  ) as Promise<ReturnOrderResponse>;
}

export default {
  login,
  retryAssignAWB,
  generateAWB,
  generateLabel,
  generateManifest,
  generateManifestBatch,
  schedulePickup,
  printManifest,
  cancelShipment,
  createReturnOrder,
  getReturnShippingRate,
};
