// lib/shiprocket.ts

let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

async function login() {
  if (
    cachedToken &&
    tokenExpiry &&
    Date.now() < tokenExpiry - 60 * 1000 // refresh 1 min before expiry
  ) {
    return cachedToken;
  }

  const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "deepanshucode1@gmail.com",
      password: "WCUfExSSGB@#67hj",
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Shiprocket login failed");
  }

  cachedToken = data.token;
  tokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  return cachedToken;
}

async function authedFetch(url: string, options: any = {}) {
  const token = await login();

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  console.log(res);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));

  return data;
}

// -----------------------------------------------------
// 📦 CREATE LABEL
// -----------------------------------------------------
export async function generateLabel(orderId: string) {
  return authedFetch(
    "https://apiv2.shiprocket.in/v1/external/courier/generate/label",
    {
      method: "POST",
      body: JSON.stringify({ shipment_id: orderId }),
    }
  );
}

export async function retryAssignAWB({
  token,
  shipmentId,
  maxRetries = 3,
  orderId,
  supabase
}: {
  token: string;
  shipmentId: number;
  orderId: string;
  maxRetries?: number;
  supabase: any;
}) {

  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      console.log(`Attempt ${attempt + 1} to assign AWB...`);

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
      console.log("AWB Response:", result);

      // If AWB assignment succeeded
      if (result?.awb_assign_status === 1) {
        // Save in database
        await supabase
          .from("orders")
          .update({
            shiprocket_awb_code: result.response.data.awb_code,
            shiprocket_status: "READY_TO_SHIP",
            shiprocket_shipment_id : shipmentId,
            shiprocker_order_id : orderId
          })
          .eq("id", orderId);

        console.log("AWB assigned successfully!");
        return { success: true, result };
      }

      // If failed, throw and retry
      throw new Error(result?.message || "Failed to assign AWB");

    } catch (err) {
      console.error(`AWB assignment attempt ${attempt + 1} failed:`, err);
      attempt++;

      if (attempt >= maxRetries) {
        // Final failure — update DB status
        await supabase
          .from("orders")
          .update({
            shiprocket_status: "AWB_PENDING",
            shiprocket_shipment_id : shipmentId,
            shiprocker_order_id : orderId
          })
          .eq("id", orderId);

        return { success: false, error: err };
      }

      // Exponential delay
      const delay = 2000 * attempt;
      await new Promise(res => setTimeout(res, delay));
    }
  }
}


// -----------------------------------------------------
// 🧾 CREATE MANIFEST (Batch)
// -----------------------------------------------------
export async function generateManifestBatch(orderIds: string[]) {
  return authedFetch(
    "https://apiv2.shiprocket.in/v1/external/manifests/generate",
    {
      method: "POST",
      body: JSON.stringify({ shipment_id: orderIds }),
    }
  );
}

// -----------------------------------------------------
// 🧾 CREATE MANIFEST (Single order – rarely used)
// -----------------------------------------------------
export async function generateManifest(orderId: string) {
  return generateManifestBatch([orderId]);
}

// -----------------------------------------------------
// 🖨 PRINT MANIFEST (download/view later)
// -----------------------------------------------------
export async function printManifest(manifestId: number | string) {
  return authedFetch(
    `https://apiv2.shiprocket.in/v1/external/manifests/print?manifest_ids[]=${manifestId}`,
    {
      method: "GET",
    }
  );
}

// -----------------------------------------------------
// 🚚 SCHEDULE PICKUP
// -----------------------------------------------------
export async function schedulePickup(orderId: string) {
  return authedFetch(
    "https://apiv2.shiprocket.in/v1/external/courier/generate/pickup",
    {
      method: "POST",
      body: JSON.stringify({ shipment_id: [orderId] }),
    }
  );
}

export async function generateAWB(shipmentId: string) {
  return authedFetch(
    "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
    {
      method: "POST",
      body: JSON.stringify({
        shipment_id: shipmentId
      }),
    }
  );
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
