// lib/shiprocket.ts

import { logError, logOrder } from "@/lib/logger";
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
export async function generateLabel(orderId: string): Promise<LabelResponse> {
  return authedFetch(
    "https://apiv2.shiprocket.in/v1/external/courier/generate/label",
    {
      method: "POST",
      body: JSON.stringify({ shipment_id: orderId }),
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
            shiprocket_status: "PICKUP_SCHEDULED",
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
        await supabase
          .from("orders")
          .update({
            shiprocket_status: "AWB_PENDING",
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
export async function generateManifestBatch(orderIds: string[]): Promise<ManifestResponse> {
  return authedFetch(
    "https://apiv2.shiprocket.in/v1/external/manifests/generate",
    {
      method: "POST",
      body: JSON.stringify({ shipment_id: orderIds }),
    }
  ) as Promise<ManifestResponse>;
}

// -----------------------------------------------------
// 🧾 CREATE MANIFEST (Single order – rarely used)
// -----------------------------------------------------
export async function generateManifest(orderId: string): Promise<ManifestResponse> {
  return generateManifestBatch([orderId]);
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
export async function schedulePickup(orderId: string): Promise<PickupResponse> {
  return authedFetch(
    "https://apiv2.shiprocket.in/v1/external/courier/generate/pickup",
    {
      method: "POST",
      body: JSON.stringify({ shipment_id: [orderId] }),
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

export default {
  login,
  retryAssignAWB,
  generateAWB,
  generateLabel,
  generateManifest,
  generateManifestBatch,
  schedulePickup,
  printManifest,
};
