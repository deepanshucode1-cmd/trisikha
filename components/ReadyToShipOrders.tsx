"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type Order = {
  id: string;
  shiprocket_status?: string | null;
  created_at?: string | null;
  total_amount?: number | null;
  shipping_first_name?: string | null;
  shipping_last_name?: string | null;
};

export default function OrderManagement() {
  // --- Tab State ---
  const [activeTab, setActiveTab] = useState<"ready_to_ship" | "cancellation_failed">("ready_to_ship");

  // --- Shared State ---
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // --- Ready to Ship Specific State ---
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // map of orderId -> boolean (for loading spinners on buttons)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // --- Helpers ---
  const setOrderActionLoading = (orderId: string, val: boolean) => {
    setActionLoading((s) => ({ ...s, [orderId]: val }));
  };

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

  // --- API Calls ---

  // 1. Fetch Orders (Dynamic based on Tab)
  useEffect(() => {
    let mounted = true;

    const fetchOrders = async () => {
      setLoading(true);
      setError(null);
      // Reset selection when switching tabs
      setSelected([]); 

      try {
        // DETECT ENDPOINT BASED ON TAB
        const endpoint = activeTab === "ready_to_ship" 
          ? "/api/orders/get-new-orders" 
          : "/api/orders/get-cancellation-failed"; // <--- Ensure this endpoint exists

        const res = await fetch(endpoint);

        if (!res.ok) {
          throw new Error("Failed to fetch orders");
        }

        const json = await res.json();

        if (mounted) {
          setOrders(json.orders || []);
        }
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
  }, [activeTab]);

  // 2. Generic Seller API Helper
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

  // 3. Batch Manifest (Ready to Ship)
  const generateManifestBatch = async () => {
    if (selected.length === 0) return alert("Select at least one order.");
    setSubmitting(true);

    try {
      const res = await fetch("/api/seller/shiprocket/generate-manifest-batch", {
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
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      alert("Manifest failed.");
    }
    setSubmitting(false);
  };

  // 4. Single Order Actions (Ready to Ship)
  const generateLabel = async (orderId: string) => {
    try {
      setOrderActionLoading(orderId, true);
      await callSellerApi("generate-label", { orderId: orderId });
      alert("Label generated successfully.");
    } catch (err: any) {
      console.error("Generate label error:", err);
      alert("Failed to generate label: " + (err?.message ?? err));
    } finally {
      setOrderActionLoading(orderId, false);
    }
  };

  const schedulePickup = async (orderId: string) => {
    if (!confirm("Schedule pickup for this order?")) return;
    try {
      setOrderActionLoading(orderId, true);
      await callSellerApi("schedule-pickup", { orderId: orderId });
      alert("Pickup scheduled successfully.");
    } catch (err: any) {
      console.error("Schedule pickup error:", err);
      alert("Failed to schedule pickup: " + (err?.message ?? err));
    } finally {
      setOrderActionLoading(orderId, false);
    }
  };

  const processOrder = async (orderId: string) => {
    if (!confirm("Create Shiprocket order and assign AWB?")) return;
    try {
      setOrderActionLoading(orderId, true);
      const res = await fetch("/api/seller/shiprocket/assign-awb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed!");
      }
      await res.json();
      alert("Order registered and AWB assigned successfully!");
      window.location.reload();
    } catch (err: any) {
      console.error("Shiprocket error:", err);
      alert(err.message ?? "Failed to process order");
    } finally {
      setOrderActionLoading(orderId, false);
    }
  };

  // 5. Retry Cancellation (Cancellation Failed Tab)
const retryCancellation = async (orderId: string) => {
  if (!confirm("Retry cancelling this order?")) return;

  try {
    setOrderActionLoading(orderId, true);

    const res = await fetch("/api/orders/cancel/retry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ orderId: orderId }),
    });

    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    console.log("Retry response:", res.status, data);

    if (!res.ok) {
      throw new Error(data?.error || "Cancellation retry failed");
    }

    alert("Cancellation retry initiated successfully.");
    window.location.reload();

  } catch (err: any) {
    console.error("Retry error:", err);
    alert(err.message || "Failed to retry cancellation");
  } finally {
    setOrderActionLoading(orderId, false);
  }
};

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 pb-2">
        <h1 className="text-3xl font-bold text-gray-900">Order Management</h1>
        <p className="text-gray-600 mt-1">Manage shipments and exception flows.</p>
      </div>

      {/* --- TABS --- */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab("ready_to_ship")}
            className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
              ${
                activeTab === "ready_to_ship"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            Ready to Ship
          </button>
          <button
            onClick={() => setActiveTab("cancellation_failed")}
            className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
              ${
                activeTab === "cancellation_failed"
                  ? "border-red-500 text-red-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            Cancellation Failed
          </button>
        </nav>
      </div>

      {/* --- ERROR STATE --- */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* --- LOADING STATE --- */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">Loading orders...</span>
        </div>
      ) : (
        <>
          {/* --- EMPTY STATE --- */}
          {orders.length === 0 && !error && (
            <div className="mt-4 bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-8 text-center py-12">
                <p className="text-gray-500 text-lg">
                  No orders found in {activeTab === "ready_to_ship" ? "READY_TO_SHIP" : "CANCELLATION_FAILED"} state.
                </p>
              </div>
            </div>
          )}

          {/* --- CONTENT --- */}
          {orders.length > 0 && (
            <>
              {/* --- TAB 1: READY TO SHIP --- */}
              {activeTab === "ready_to_ship" && (
                <>
                  {/* Batch Controls */}
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
                          Select all ({selected.length})
                        </label>
                      </div>
                      <button onClick={clearSelection} className="px-3 py-1 text-sm text-gray-600 border rounded-md hover:bg-gray-100">
                        Clear
                      </button>
                    </div>
                    <button
                      onClick={generateManifestBatch}
                      disabled={submitting || selected.length === 0}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md font-medium"
                    >
                      {submitting ? "Generating..." : `Generate Manifest (${selected.length})`}
                    </button>
                  </div>

                  {/* Ready to Ship Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {orders.map((order) => {
                      const formattedDate = order.created_at
                        ? new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
                        : 'N/A';
                      const isLoading = actionLoading[order.id];

                      return (
                        <div key={order.id} className="bg-white hover:shadow-lg transition-shadow border border-gray-200 rounded-lg overflow-hidden">
                          <div className="p-4 pb-3 flex justify-between items-start">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              {order.shiprocket_status || "Ready"}
                            </span>
                            <input
                              type="checkbox"
                              checked={selected.includes(order.id)}
                              onChange={() => toggleSelection(order.id)}
                              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 ml-2"
                            />
                          </div>
                          <div className="p-4 pt-0 space-y-3">
                            <div>
                              <p className="text-2xl font-bold text-gray-900">₹{order.total_amount?.toLocaleString('en-IN')}</p>
                              {order.shipping_first_name && <p className="text-sm text-gray-600 mt-1">{order.shipping_first_name}</p>}
                            </div>
                            <p className="text-sm text-gray-500">Created: {formattedDate}</p>
                            <Link href={`/seller/orders/${order.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                              View Details →
                            </Link>
                          </div>
                          <div className="p-4 border-t border-gray-100 space-y-2">
                            <button
                              onClick={() => processOrder(order.id)}
                              disabled={isLoading}
                              className="w-full px-4 py-2 text-sm border text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 flex justify-center items-center"
                            >
                              {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>}
                              Register & Assign AWB
                            </button>
                            <button
                              onClick={() => generateLabel(order.id)}
                              disabled={isLoading}
                              className="w-full px-4 py-2 text-sm border text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 flex justify-center items-center"
                            >
                              {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>}
                              Generate Label
                            </button>
                            <button
                              onClick={() => schedulePickup(order.id)}
                              disabled={isLoading}
                              className="w-full px-4 py-2 text-sm border text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 flex justify-center items-center"
                            >
                              {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>}
                              Schedule Pickup
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* --- TAB 2: CANCELLATION FAILED --- */}
              {activeTab === "cancellation_failed" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {orders.map((order) => {
                    const formattedDate = order.created_at
                      ? new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
                      : 'N/A';
                    const isLoading = actionLoading[order.id];

                    return (
                      <div key={order.id} className="bg-white hover:shadow-lg transition-shadow border border-red-200 rounded-lg overflow-hidden">
                        <div className="p-4 pb-3 flex justify-between items-start">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            Failed Cancellation
                          </span>
                        </div>
                        <div className="p-4 pt-0 space-y-3">
                          <div>
                            <p className="text-2xl font-bold text-gray-900">₹{order.total_amount?.toLocaleString('en-IN')}</p>
                            {order.shipping_first_name && <p className="text-sm text-gray-600 mt-1">{order.shipping_first_name}</p>}
                          </div>
                          <p className="text-sm text-gray-500">Created: {formattedDate}</p>
                          <Link href={`/seller/orders/cancellation-requested/${order.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                            View Details →
                          </Link>
                        </div>
                        <div className="p-4 border-t border-gray-100">
                          <button
                            onClick={() => retryCancellation(order.id)}
                            disabled={isLoading}
                            className="w-full px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex justify-center items-center font-medium transition-colors"
                          >
                            {isLoading && (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            )}
                            Retry Cancellation
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}