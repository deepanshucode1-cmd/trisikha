"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

type Order = {
  id: string;
  shiprocket_status?: string | null;
  created_at?: string | null;
  total_amount?: number | null;
  shipping_name?: string | null;
};

export default function ReadyToShipOrders() {
 const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
const [error, setError] = useState<string | null>(null);

  // map of orderId -> { label: bool, manifest: bool, pickup: bool }
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

const toggleSelection = (orderId: string) => {
    setSelected((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    );
  };

  const selectAll = () => {
    setSelected(orders.map((o) => o.id));
  };

  const clearSelection = () => setSelected([]);

  const generateManifestBatch = async () => {
    if (selected.length === 0) return alert("Select at least one order.");

    setSubmitting(true);

    try {
      const res = await fetch("/api/seller/generate-manifest-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: selected }),
      });

      const result = await res.json();

      if (!res.ok) {
        alert(result.error || "Failed to generate manifest.");
      } else {
        alert("Manifest generated successfully!");
        clearSelection();

        // Refresh orders list
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      alert("Manifest failed.");
    }

    setSubmitting(false);
  };



  useEffect(() => {
    let mounted = true;

    const fetchOrders = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from("orders")
          .select(
            "id, shiprocket_status, created_at, total_amount, shipping_name"
          )
          .eq("shiprocket_status", "READY_TO_SHIP")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Supabase error:", error);
          if (mounted) setError("Failed to load orders.");
          return;
        }

        if (mounted) setOrders((data as Order[]) || []);
      } catch (err) {
        console.error("Fetch orders failed:", err);
        if (mounted) setError("Failed to load orders.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchOrders();

    return () => {
      mounted = false;
    };
  }, []);

  const setOrderActionLoading = (orderId: string, val: boolean) => {
    setActionLoading((s) => ({ ...s, [orderId]: val }));
  };

  // Generic helper to call seller APIs. Update endpoints as needed.
  const callSellerApi = async (path: string, body: any) => {
    const res = await fetch(`/api/seller/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `Request failed: ${res.status}`);
    }
    return res.json();
  };

  const generateLabel = async (orderId: string) => {
    try {
      setOrderActionLoading(orderId, true);
      await callSellerApi("generate-label", { order_id: orderId });
      alert("Label generated successfully.");
      // optionally refresh orders or order detail
    } catch (err: any) {
      console.error("Generate label error:", err);
      alert("Failed to generate label: " + (err?.message ?? err));
    } finally {
      setOrderActionLoading(orderId, false);
    }
  };

  const generateManifest = async (orderId: string) => {
    try {
      setOrderActionLoading(orderId, true);
      await callSellerApi("generate-manifest", { order_id: orderId });
      alert("Manifest generated successfully.");
    } catch (err: any) {
      console.error("Generate manifest error:", err);
      alert("Failed to generate manifest: " + (err?.message ?? err));
    } finally {
      setOrderActionLoading(orderId, false);
    }
  };

  const schedulePickup = async (orderId: string) => {
    // optional: confirm with user
    if (!confirm("Schedule pickup for this order?")) return;

    try {
      setOrderActionLoading(orderId, true);
      await callSellerApi("schedule-pickup", { order_id: orderId });
      alert("Pickup scheduled successfully.");
      // Optionally refresh order status
    } catch (err: any) {
      console.error("Schedule pickup error:", err);
      alert("Failed to schedule pickup: " + (err?.message ?? err));
    } finally {
      setOrderActionLoading(orderId, false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Ready To Ship Orders</h1>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-400 mb-4">{error}</p>}

      {!loading && !error && orders.length === 0 && (
        <p>No orders in READY_TO_SHIP state.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {orders.map((order) => {
          const isBusy = !!actionLoading[order.id];
          return (
            <div className="bg-white border rounded-2xl shadow-sm p-4" key={order.id} >
              <div className="mt-2">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {`Order ID: ${order.id}`}
                    </h2>
                    {order.shipping_name && (
                      <p className="text-sm text-gray-600">Customer: {order.shipping_name}</p>
                    )}
                  </div>

                  <Badge>{order.shiprocket_status ?? "UNKNOWN"}</Badge>
                </div>

                <p className="text-sm mb-1">Amount: ₹{order.total_amount ?? "—"}</p>
                <p className="text-xs text-gray-500 mb-3">
                  {order.created_at ? new Date(order.created_at).toLocaleString() : "—"}
                </p>

                <div className="flex flex-col gap-2">
                  <button
                    disabled={isBusy}
                    onClick={() => generateLabel(order.id)}
                    className="w-full bg-[#4f4d3e] hover:bg-[#6a684d] text-[#e0dbb5] px-4 py-2 rounded-lg transition disabled:opacity-60"
                  >
                    {isBusy ? "Working..." : "Generate Label"}
                  </button>

                  <button
                    disabled={isBusy}
                    onClick={() => generateManifest(order.id)}
                    className="w-full bg-[#4f4d3e] hover:bg-[#6a684d] text-[#e0dbb5] px-4 py-2 rounded-lg transition disabled:opacity-60"
                  >
                    {isBusy ? "Working..." : "Generate Manifest"}
                  </button>

                  <button
                    disabled={isBusy}
                    onClick={() => schedulePickup(order.id)}
                    className="w-full bg-[#4f4d3e] hover:bg-[#6a684d] text-[#e0dbb5] px-4 py-2 rounded-lg transition disabled:opacity-60"
                  >
                    {isBusy ? "Working..." : "Schedule Pickup"}
                  </button>

                  <Link
                    href={`/seller/orders/${order.id}`}
                    className="mt-2 text-sm text-blue-600 underline"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
