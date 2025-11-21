"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
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
    const res = await fetch(`/api/seller/shiprocket/${path}`, {
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
      await callSellerApi("generate-label", { orderId: orderId });
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
      await callSellerApi("schedule-pickup", { orderId: orderId });
      alert("Pickup scheduled successfully.");
      // Optionally refresh order status
    } catch (err: any) {
      console.error("Schedule pickup error:", err);
      alert("Failed to schedule pickup: " + (err?.message ?? err));
    } finally {
      setOrderActionLoading(orderId, false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">Loading orders...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 pb-2">
        <h1 className="text-3xl font-bold text-gray-900">Ready to Ship Orders</h1>
        <p className="text-gray-600 mt-1">Manage and process your pending shipments.</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div className="mt-4 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-8 text-center py-12">
            <p className="text-gray-500 text-lg">No orders in READY_TO_SHIP state.</p>
          </div>
        </div>
      )}

      {orders.length > 0 && (
        <>
          {/* Batch Actions Header */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-gray-50 p-4 rounded-lg border">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="select-all"
                  checked={selected.length === orders.length}
                  onChange={(e) => {
                    if (e.target.checked) selectAll();
                    else clearSelection();
                  }}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="select-all" className="text-sm font-medium text-gray-700">
                  Select all ({selected.length} / {orders.length})
                </label>
              </div>
              <button
                onClick={clearSelection}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
              >
                Clear Selection
              </button>
            </div>
            <button
              onClick={generateManifestBatch}
              disabled={submitting || selected.length === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors flex items-center"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Generating...
                </>
              ) : (
                `Generate Manifest for ${selected.length} Order${selected.length !== 1 ? 's' : ''}`
              )}
            </button>
          </div>

          {/* Orders Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.map((order) => {
              const formattedDate = order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
              const isLoading = actionLoading[order.id];

              return (
                <div key={order.id} className="bg-white hover:shadow-lg transition-shadow border border-gray-200 rounded-lg overflow-hidden">
                  <div className="p-4 pb-3">
                    <div className="flex justify-between items-start">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {order.shiprocket_status}
                      </span>
                      <input
                        type="checkbox"
                        checked={selected.includes(order.id)}
                        onChange={() => toggleSelection(order.id)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 ml-2"
                      />
                    </div>
                  </div>
                  <div className="p-4 pt-0 pb-0">
                    <div className="space-y-3">
                      <div>
                        <p className="text-2xl font-bold text-gray-900">₹{order.total_amount?.toLocaleString('en-IN')}</p>
                        {order.shipping_name && (
                          <p className="text-sm text-gray-600 mt-1">{order.shipping_name}</p>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">Created: {formattedDate}</p>
                      <Link
                        href={`/seller/orders/${order.id}`}
                        className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
                      >
                        View Details →
                      </Link>
                    </div>
                  </div>
                  <div className="p-4 pt-0 border-t border-gray-100">
                    <div className="space-y-2">
                      <button
                        onClick={() => generateLabel(order.id)}
                        disabled={isLoading}
                        className="w-full justify-center px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isLoading ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 inline-block mr-2"></div>
                        ) : null}
                        Generate Label
                      </button>
                      
                      <button
                        onClick={() => schedulePickup(order.id)}
                        disabled={isLoading}
                        className="w-full justify-center px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isLoading ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 inline-block mr-2"></div>
                        ) : null}
                        Schedule Pickup
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}