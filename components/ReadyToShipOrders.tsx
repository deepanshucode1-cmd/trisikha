"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useCsrf } from "@/hooks/useCsrf";
import { sanitizeUrl } from "@/lib/xss";

// --- Types ---
type Order = {
  id: string;
  shiprocket_status?: string | null;
  created_at?: string | null;
  total_amount?: number | null;
  shipping_first_name?: string | null;
  shipping_last_name?: string | null;
  // Shiprocket fields
  shiprocket_order_id?: string | null;
  shiprocket_shipment_id?: string | null;
  shiprocket_awb_code?: string | null;
  shiprocket_label_url?: string | null;
  shiprocket_manifest_generated?: boolean | null;
  shiprocket_manifest_url?: string | null;
  pickup_scheduled_at?: string | null;
  // Return fields
  return_status?: string | null;
  return_reason?: string | null;
  return_refund_amount?: number | null;
  return_requested_at?: string | null;
  return_pickup_awb?: string | null;
  return_admin_note?: string | null;
  return_deduction_amount?: number | null;
  return_deduction_reason?: string | null;
  guest_email?: string | null;
  items?: { product_name: string; quantity: number; unit_price: number; sku?: string }[];
};

/**
 * Simplified Shipping Stages:
 * 1. new - Order created, needs AWB assignment
 * 2. awb_assigned - AWB assigned, ready to ship (Label + Pickup + Manifest)
 * 3. shipped - Fully processed, awaiting courier pickup
 */
type ShippingStage = "new" | "awb_assigned" | "shipped";

type PackageDimensions = {
  weight: number;
  length: number;
  breadth: number;
  height: number;
};

// --- Helper Functions ---
function getShippingStage(order: Order): ShippingStage {
  // Shipped = manifest generated (means label + pickup + manifest all done)
  if (order.shiprocket_manifest_generated) {
    return "shipped";
  }
  // AWB Assigned = has AWB code, ready to ship
  if (order.shiprocket_awb_code) {
    return "awb_assigned";
  }
  // New = needs AWB assignment
  return "new";
}

const STAGE_CONFIG: Record<ShippingStage, {
  label: string;
  color: string;
  bgColor: string;
  action: string;
  bulkAction: string;
  description: string;
}> = {
  new: {
    label: "New Orders",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    action: "Assign AWB",
    bulkAction: "Assign AWB to Selected",
    description: "Register order with Shiprocket and assign courier",
  },
  awb_assigned: {
    label: "Ready to Ship",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
    action: "Ship Order",
    bulkAction: "Ship Selected Orders",
    description: "Generate label, schedule pickup & create manifest",
  },
  shipped: {
    label: "Shipped",
    color: "text-green-600",
    bgColor: "bg-green-100",
    action: "",
    bulkAction: "",
    description: "Awaiting courier pickup",
  },
};

const STAGE_ORDER: ShippingStage[] = ["new", "awb_assigned", "shipped"];

export default function OrderManagement() {
  // --- CSRF Protection ---
  const { csrfFetch, getCsrfHeaders } = useCsrf();

  // --- Tab State ---
  const [activeMainTab, setActiveMainTab] = useState<"shipping" | "cancellation_failed" | "returns">("shipping");
  const [activeShippingStage, setActiveShippingStage] = useState<ShippingStage>("new");

  // --- Shared State ---
  const [orders, setOrders] = useState<Order[]>([]);
  const [cancellationFailedOrders, setCancellationFailedOrders] = useState<Order[]>([]);
  const [returnOrders, setReturnOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Process Return Refund Modal State ---
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundOrderId, setRefundOrderId] = useState<string | null>(null);
  const [refundMaxAmount, setRefundMaxAmount] = useState(0);
  const [productCondition, setProductCondition] = useState<"good_condition" | "damaged" | "used">("good_condition");
  const [adminNote, setAdminNote] = useState("");
  const [deductionAmount, setDeductionAmount] = useState(0);
  const [refundPhotos, setRefundPhotos] = useState<File[]>([]);
  const [refundSubmitting, setRefundSubmitting] = useState(false);

  // --- Selection State ---
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // --- Dimension Modal State ---
  const [showDimensionModal, setShowDimensionModal] = useState(false);
  const [dimensionOrderId, setDimensionOrderId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<PackageDimensions>({
    weight: 1,
    length: 20,
    breadth: 15,
    height: 10,
  });

  // --- Computed: Orders grouped by stage ---
  const ordersByStage = useMemo(() => {
    const grouped: Record<ShippingStage, Order[]> = {
      new: [],
      awb_assigned: [],
      shipped: [],
    };
    for (const order of orders) {
      const stage = getShippingStage(order);
      grouped[stage].push(order);
    }
    return grouped;
  }, [orders]);

  const currentStageOrders = ordersByStage[activeShippingStage];

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

  const selectAllInStage = () => {
    setSelected(currentStageOrders.map((o) => o.id));
  };

  const clearSelection = () => setSelected([]);

  // Clear selection when switching stages
  useEffect(() => {
    setSelected([]);
  }, [activeShippingStage]);

  // --- API Calls ---

  // Fetch Orders
  useEffect(() => {
    let mounted = true;

    const fetchOrders = async () => {
      setLoading(true);
      setError(null);

      try {
        const [shippingRes, cancellationRes, returnsRes] = await Promise.all([
          fetch("/api/orders/get-new-orders"),
          fetch("/api/orders/get-cancellation-failed"),
          fetch("/api/admin/orders/returns"),
        ]);

        if (!shippingRes.ok) throw new Error("Failed to fetch shipping orders");

        const shippingJson = await shippingRes.json();
        if (mounted) {
          setOrders(shippingJson.orders || []);
        }

        if (cancellationRes.ok) {
          const cancellationJson = await cancellationRes.json();
          if (mounted) {
            setCancellationFailedOrders(cancellationJson.orders || []);
          }
        }

        if (returnsRes.ok) {
          const returnsJson = await returnsRes.json();
          if (mounted) {
            setReturnOrders(returnsJson.orders || []);
          }
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
  }, []);

  // --- Single Order Actions ---

  // Step 1: Assign AWB (creates Shiprocket order + assigns courier)
  const assignAwb = async (orderId: string, providedDimensions?: PackageDimensions) => {
    try {
      setOrderActionLoading(orderId, true);

      // Check total quantity for this order
      const itemCountRes = await fetch(`/api/orders/get-order-item-count/${orderId}`);
      if (!itemCountRes.ok) {
        throw new Error("Failed to check order items");
      }
      const { total_quantity } = await itemCountRes.json();

      // If total quantity > 1 and no dimensions provided, show modal
      if (total_quantity > 1 && !providedDimensions) {
        setDimensionOrderId(orderId);
        setDimensions({ weight: 1, length: 20, breadth: 15, height: 10 });
        setShowDimensionModal(true);
        setOrderActionLoading(orderId, false);
        return;
      }

      // Proceed with AWB assignment
      const payload: Record<string, unknown> = { order_id: orderId };
      if (providedDimensions) {
        payload.package_weight = providedDimensions.weight;
        payload.package_length = providedDimensions.length;
        payload.package_breadth = providedDimensions.breadth;
        payload.package_height = providedDimensions.height;
      }

      const res = await csrfFetch("/api/seller/shiprocket/assign-awb", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to assign AWB");
      }

      // Handle awb_pending status
      if (result.status === "awb_pending") {
        alert("Order registered with Shiprocket. AWB assignment is pending - please retry shortly.");
      } else {
        alert("AWB assigned successfully! Order is now ready to ship.");
      }
      window.location.reload();
    } catch (err: unknown) {
      console.error("Assign AWB error:", err);
      const message = err instanceof Error ? err.message : "Failed to assign AWB";
      alert(message);
    } finally {
      setOrderActionLoading(orderId, false);
    }
  };

  const handleDimensionSubmit = () => {
    if (!dimensionOrderId) return;
    setShowDimensionModal(false);
    assignAwb(dimensionOrderId, dimensions);
  };

  // Step 2: Ship Order (generates label + schedules pickup + creates manifest)
  const shipOrder = async (orderId: string) => {
    try {
      setOrderActionLoading(orderId, true);

      const res = await csrfFetch("/api/seller/shiprocket/ship", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ orderId }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to ship order");
      }

      alert("Order shipped successfully! Label and manifest generated.");

      // Open label in new tab if available (sanitized to prevent XSS)
      const safeLabelUrl = sanitizeUrl(result.label_url);
      if (safeLabelUrl) {
        window.open(safeLabelUrl, "_blank");
      }

      window.location.reload();
    } catch (err: unknown) {
      console.error("Ship order error:", err);
      const message = err instanceof Error ? err.message : "Failed to ship order";
      alert(message);
    } finally {
      setOrderActionLoading(orderId, false);
    }
  };

  // --- Bulk Actions ---

  const handleBulkAction = async () => {
    if (selected.length === 0) {
      alert("Please select at least one order.");
      return;
    }

    setSubmitting(true);

    try {
      switch (activeShippingStage) {
        case "new":
          // Bulk AWB assignment - process one by one (dimensions might be needed)
          for (const orderId of selected) {
            await assignAwb(orderId);
          }
          break;

        case "awb_assigned":
          // Bulk ship - process one by one
          let successCount = 0;
          let failCount = 0;

          for (const orderId of selected) {
            try {
              const res = await csrfFetch("/api/seller/shiprocket/ship", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
                body: JSON.stringify({ orderId }),
              });

              if (res.ok) {
                successCount++;
              } else {
                failCount++;
              }
            } catch {
              failCount++;
            }
          }

          alert(`Shipped ${successCount} orders. ${failCount > 0 ? `${failCount} failed.` : ""}`);
          window.location.reload();
          break;

        default:
          break;
      }
    } finally {
      setSubmitting(false);
    }
  };

  // --- Retry Cancellation ---
  const retryCancellation = async (orderId: string) => {
    if (!confirm("Retry cancelling this order?")) return;

    try {
      setActionLoading((s) => ({ ...s, [orderId]: true }));

      const res = await csrfFetch("/api/orders/cancel/retry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({ orderId }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        throw new Error(data?.error || "Cancellation retry failed");
      }

      alert("Cancellation retry initiated successfully.");
      window.location.reload();
    } catch (err: unknown) {
      console.error("Retry error:", err);
      const message = err instanceof Error ? err.message : "Failed to retry cancellation";
      alert(message);
    } finally {
      setActionLoading((s) => ({ ...s, [orderId]: false }));
    }
  };

  // --- Return Actions ---

  const markReturnReceived = async (orderId: string) => {
    if (!confirm("Mark this return as received at warehouse?")) return;

    try {
      setActionLoading((s) => ({ ...s, [orderId]: true }));

      const res = await csrfFetch(`/api/admin/orders/${orderId}/mark-return-received`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to mark as received");

      alert("Return marked as received.");
      window.location.reload();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to mark return received";
      alert(message);
    } finally {
      setActionLoading((s) => ({ ...s, [orderId]: false }));
    }
  };

  const openRefundModal = (order: Order) => {
    setRefundOrderId(order.id);
    setRefundMaxAmount(order.return_refund_amount || 0);
    setProductCondition("good_condition");
    setAdminNote("");
    setDeductionAmount(0);
    setRefundPhotos([]);
    setShowRefundModal(true);
  };

  const handleProcessRefund = async () => {
    if (!refundOrderId) return;

    const hasDeduction = productCondition !== "good_condition";
    if (hasDeduction && adminNote.trim().length < 10) {
      alert("Admin note is required (min 10 characters) when product is not in good condition.");
      return;
    }
    if (hasDeduction && refundPhotos.length === 0) {
      alert("At least 1 photo is required when applying a deduction.");
      return;
    }
    if (deductionAmount > refundMaxAmount) {
      alert(`Deduction cannot exceed ₹${refundMaxAmount}`);
      return;
    }

    if (!confirm(`Process refund of ₹${(refundMaxAmount - deductionAmount).toFixed(2)}?`)) return;

    setRefundSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("product_condition", productCondition);
      if (hasDeduction) {
        formData.append("admin_note", adminNote);
        formData.append("deduction_amount", deductionAmount.toString());
      }
      for (const photo of refundPhotos) {
        formData.append("photos", photo);
      }

      const res = await csrfFetch(`/api/admin/orders/${refundOrderId}/process-return-refund`, {
        method: "POST",
        headers: { ...getCsrfHeaders() },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to process refund");

      alert(`Refund of ₹${data.refundAmount} processed successfully.`);
      setShowRefundModal(false);
      window.location.reload();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to process refund";
      alert(message);
    } finally {
      setRefundSubmitting(false);
    }
  };

  // --- Render Helpers ---

  const renderOrderCard = (order: Order, stage: ShippingStage) => {
    const formattedDate = order.created_at
      ? new Date(order.created_at).toLocaleDateString("en-IN", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "N/A";
    const isLoading = actionLoading[order.id];
    const config = STAGE_CONFIG[stage];

    const handlePrimaryAction = () => {
      switch (stage) {
        case "new":
          assignAwb(order.id);
          break;
        case "awb_assigned":
          shipOrder(order.id);
          break;
        default:
          break;
      }
    };

    return (
      <div
        key={order.id}
        className="bg-white hover:shadow-lg transition-shadow border border-gray-200 rounded-lg overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 pb-3 flex justify-between items-start">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}
          >
            {config.label}
          </span>
          {stage !== "shipped" && (
            <input
              type="checkbox"
              checked={selected.includes(order.id)}
              onChange={() => toggleSelection(order.id)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 ml-2"
            />
          )}
        </div>

        {/* Content */}
        <div className="p-4 pt-0 space-y-3">
          <div>
            <p className="text-2xl font-bold text-gray-900">
              ₹{order.total_amount?.toLocaleString("en-IN")}
            </p>
            {order.shipping_first_name && (
              <p className="text-sm text-gray-600 mt-1">{order.shipping_first_name}</p>
            )}
          </div>

          {/* Shiprocket Info */}
          <div className="space-y-1 text-xs text-gray-500">
            <p>Created: {formattedDate}</p>
            {order.shiprocket_awb_code && (
              <p className="font-mono">AWB: {order.shiprocket_awb_code}</p>
            )}
            {/* Show AWB pending indicator */}
            {stage === "new" && order.shiprocket_shipment_id && !order.shiprocket_awb_code && (
              <p className="text-orange-600 font-medium">AWB assignment pending - retry</p>
            )}
            {sanitizeUrl(order.shiprocket_label_url) && (
              <a
                href={sanitizeUrl(order.shiprocket_label_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline block"
              >
                Download Label
              </a>
            )}
          </div>

          <Link
            href={`/seller/orders/${order.id}`}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            View Details →
          </Link>
        </div>

        {/* Actions */}
        {stage !== "shipped" && (
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={handlePrimaryAction}
              disabled={isLoading}
              className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center font-medium"
            >
              {isLoading && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              )}
              {stage === "new" && order.shiprocket_shipment_id && !order.shiprocket_awb_code
                ? "Retry AWB Assignment"
                : config.action}
            </button>
            <p className="text-xs text-gray-500 mt-2 text-center">{config.description}</p>
          </div>
        )}

        {/* Shipped - Show status and download links */}
        {stage === "shipped" && (
          <div className="p-4 border-t border-gray-100 space-y-2">
            <p className="text-sm text-center text-green-600 font-medium">
              Awaiting courier pickup
            </p>
            <div className="flex gap-2">
              {sanitizeUrl(order.shiprocket_label_url) && (
                <a
                  href={sanitizeUrl(order.shiprocket_label_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-center"
                >
                  Label
                </a>
              )}
              {sanitizeUrl(order.shiprocket_manifest_url) && (
                <a
                  href={sanitizeUrl(order.shiprocket_manifest_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-3 py-2 text-sm border border-blue-300 text-blue-700 rounded-md hover:bg-blue-50 text-center"
                >
                  Manifest
                </a>
              )}
              <a
                href={`/api/seller/orders/${order.id}/invoice`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-3 py-2 text-sm border border-green-300 text-green-700 rounded-md hover:bg-green-50 text-center"
              >
                Invoice
              </a>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCancellationFailedCard = (order: Order) => {
    const formattedDate = order.created_at
      ? new Date(order.created_at).toLocaleDateString("en-IN", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "N/A";
    const isLoading = actionLoading[order.id];

    return (
      <div
        key={order.id}
        className="bg-white hover:shadow-lg transition-shadow border border-red-200 rounded-lg overflow-hidden"
      >
        <div className="p-4 pb-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            Failed Cancellation
          </span>
        </div>
        <div className="p-4 pt-0 space-y-3">
          <div>
            <p className="text-2xl font-bold text-gray-900">
              ₹{order.total_amount?.toLocaleString("en-IN")}
            </p>
            {order.shipping_first_name && (
              <p className="text-sm text-gray-600 mt-1">{order.shipping_first_name}</p>
            )}
          </div>
          <p className="text-sm text-gray-500">Created: {formattedDate}</p>
          <Link
            href={`/seller/orders/cancellation-requested/${order.id}`}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
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
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 pb-2">
        <h1 className="text-3xl font-bold text-gray-900">Order Management</h1>
        <p className="text-gray-600 mt-1">Manage shipments and exception flows.</p>
      </div>

      {/* Main Tabs: Shipping vs Cancellation Failed */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveMainTab("shipping")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeMainTab === "shipping"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Shipping ({orders.length})
          </button>
          <button
            onClick={() => setActiveMainTab("returns")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeMainTab === "returns"
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Returns ({returnOrders.length})
          </button>
          <button
            onClick={() => setActiveMainTab("cancellation_failed")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeMainTab === "cancellation_failed"
                ? "border-red-500 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Cancellation Failed ({cancellationFailedOrders.length})
          </button>
        </nav>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">Loading orders...</span>
        </div>
      ) : (
        <>
          {/* SHIPPING TAB */}
          {activeMainTab === "shipping" && (
            <>
              {/* Shipping Flow Info */}
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Shipping Flow:</strong> New Orders → Assign AWB → Ship Order (Label + Pickup + Manifest) → Awaiting Pickup
                </p>
              </div>

              {/* Shipping Stage Tabs */}
              <div className="mb-6 flex flex-wrap gap-2">
                {STAGE_ORDER.map((stage) => {
                  const count = ordersByStage[stage].length;
                  const config = STAGE_CONFIG[stage];
                  const isActive = activeShippingStage === stage;

                  return (
                    <button
                      key={stage}
                      onClick={() => setActiveShippingStage(stage)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? `${config.bgColor} ${config.color} ring-2 ring-offset-1 ring-current`
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {config.label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Bulk Controls - hide for shipped since no action needed */}
              {activeShippingStage !== "shipped" && currentStageOrders.length > 0 && (
                <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-gray-50 p-4 rounded-lg border">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="select-all"
                        checked={selected.length === currentStageOrders.length && currentStageOrders.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) selectAllInStage();
                          else clearSelection();
                        }}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="select-all" className="text-sm font-medium text-gray-700">
                        Select all ({selected.length}/{currentStageOrders.length})
                      </label>
                    </div>
                    <button
                      onClick={clearSelection}
                      className="px-3 py-1 text-sm text-gray-600 border rounded-md hover:bg-gray-100"
                    >
                      Clear
                    </button>
                  </div>
                  <button
                    onClick={handleBulkAction}
                    disabled={submitting || selected.length === 0}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md font-medium text-sm"
                  >
                    {submitting ? "Processing..." : STAGE_CONFIG[activeShippingStage].bulkAction}
                  </button>
                </div>
              )}

              {/* Orders Grid */}
              {currentStageOrders.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-8 text-center py-12">
                    <p className="text-gray-500 text-lg">
                      No orders in {STAGE_CONFIG[activeShippingStage].label} stage.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {currentStageOrders.map((order) => renderOrderCard(order, activeShippingStage))}
                </div>
              )}
            </>
          )}

          {/* RETURNS TAB */}
          {activeMainTab === "returns" && (
            <>
              {returnOrders.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-8 text-center py-12">
                    <p className="text-gray-500 text-lg">No return orders to process.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {returnOrders.map((order) => {
                    const formattedDate = order.return_requested_at
                      ? new Date(order.return_requested_at).toLocaleDateString("en-IN", {
                          year: "numeric", month: "short", day: "numeric",
                        })
                      : "N/A";
                    const isLoading = actionLoading[order.id];
                    const canMarkReceived = order.return_status === "RETURN_PICKUP_SCHEDULED" || order.return_status === "RETURN_IN_TRANSIT";
                    const canProcessRefund = order.return_status === "RETURN_DELIVERED";
                    const isReturnFailed = order.return_status === "RETURN_FAILED";

                    const statusColors: Record<string, string> = {
                      RETURN_REQUESTED: "bg-yellow-100 text-yellow-800",
                      RETURN_PICKUP_SCHEDULED: "bg-blue-100 text-blue-800",
                      RETURN_IN_TRANSIT: "bg-indigo-100 text-indigo-800",
                      RETURN_DELIVERED: "bg-green-100 text-green-800",
                      RETURN_REFUND_INITIATED: "bg-purple-100 text-purple-800",
                      RETURN_FAILED: "bg-red-100 text-red-800",
                    };

                    const statusLabels: Record<string, string> = {
                      RETURN_REQUESTED: "Return Requested",
                      RETURN_PICKUP_SCHEDULED: "Pickup Scheduled",
                      RETURN_IN_TRANSIT: "In Transit",
                      RETURN_DELIVERED: "Delivered to Warehouse",
                      RETURN_REFUND_INITIATED: "Refund Initiated",
                      RETURN_FAILED: "Return Failed",
                    };

                    return (
                      <div
                        key={order.id}
                        className="bg-white hover:shadow-lg transition-shadow border border-orange-200 rounded-lg overflow-hidden"
                      >
                        <div className="p-4 pb-3 flex justify-between items-start">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              statusColors[order.return_status || ""] || "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {statusLabels[order.return_status || ""] || order.return_status}
                          </span>
                        </div>
                        <div className="p-4 pt-0 space-y-3">
                          <div>
                            <p className="text-2xl font-bold text-gray-900">
                              ₹{order.total_amount?.toLocaleString("en-IN")}
                            </p>
                            {order.shipping_first_name && (
                              <p className="text-sm text-gray-600 mt-1">
                                {order.shipping_first_name} {order.shipping_last_name || ""}
                              </p>
                            )}
                          </div>
                          <div className="space-y-1 text-xs text-gray-500">
                            <p>Return requested: {formattedDate}</p>
                            {order.return_refund_amount != null && (
                              <p>Refund amount: <span className="font-medium text-gray-700">₹{order.return_refund_amount.toLocaleString("en-IN")}</span></p>
                            )}
                            {order.return_reason && (
                              <p>Reason: {order.return_reason}</p>
                            )}
                            {order.return_pickup_awb && (
                              <p className="font-mono">Return AWB: {order.return_pickup_awb}</p>
                            )}
                          </div>
                          {order.items && order.items.length > 0 && (
                            <div className="text-xs text-gray-500">
                              <p className="font-medium text-gray-600 mb-1">Items:</p>
                              {order.items.map((item, i) => (
                                <p key={i}>{item.product_name} x{item.quantity}</p>
                              ))}
                            </div>
                          )}
                          <Link
                            href={`/seller/orders/${order.id}`}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            View Details →
                          </Link>
                        </div>
                        <div className="p-4 border-t border-gray-100 space-y-2">
                          {canMarkReceived && (
                            <button
                              onClick={() => markReturnReceived(order.id)}
                              disabled={isLoading}
                              className="w-full px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex justify-center items-center font-medium"
                            >
                              {isLoading && (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              )}
                              Mark as Received
                            </button>
                          )}
                          {canProcessRefund && (
                            <button
                              onClick={() => openRefundModal(order)}
                              disabled={isLoading}
                              className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center font-medium"
                            >
                              Process Refund
                            </button>
                          )}
                          {isReturnFailed && (
                            <button
                              onClick={() => retryCancellation(order.id)}
                              disabled={isLoading}
                              className="w-full px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex justify-center items-center font-medium"
                            >
                              {isLoading && (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              )}
                              Retry Return Pickup
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* CANCELLATION FAILED TAB */}
          {activeMainTab === "cancellation_failed" && (
            <>
              {cancellationFailedOrders.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-8 text-center py-12">
                    <p className="text-gray-500 text-lg">No orders with failed cancellation.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {cancellationFailedOrders.map((order) => renderCancellationFailedCard(order))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Process Return Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Process Return Refund</h2>
              <p className="text-sm text-gray-600 mb-2">
                Max refund: <span className="font-bold">₹{refundMaxAmount.toLocaleString("en-IN")}</span>
              </p>
              <p className="text-sm text-green-700 font-medium mb-6">
                Final refund: ₹{Math.max(0, refundMaxAmount - deductionAmount).toLocaleString("en-IN")}
              </p>

              <div className="space-y-4">
                {/* Product Condition */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Condition</label>
                  <select
                    value={productCondition}
                    onChange={(e) => {
                      setProductCondition(e.target.value as "good_condition" | "damaged" | "used");
                      if (e.target.value === "good_condition") {
                        setDeductionAmount(0);
                        setAdminNote("");
                        setRefundPhotos([]);
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="good_condition">Good Condition (Full Refund)</option>
                    <option value="damaged">Damaged</option>
                    <option value="used">Used</option>
                  </select>
                </div>

                {/* Fields shown only when condition is not good */}
                {productCondition !== "good_condition" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Admin Note <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        placeholder="Describe the product condition (min 10 characters)..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Deduction Amount (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={refundMaxAmount}
                        step="0.01"
                        value={deductionAmount}
                        onChange={(e) => setDeductionAmount(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Inspection Photos <span className="text-red-500">*</span> (1-3, JPEG/PNG, max 5MB each)
                      </label>
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []).slice(0, 3);
                          setRefundPhotos(files);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                      {refundPhotos.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">{refundPhotos.length} file(s) selected</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
              <button
                onClick={() => setShowRefundModal(false)}
                disabled={refundSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessRefund}
                disabled={refundSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md flex items-center"
              >
                {refundSubmitting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                )}
                Process Refund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dimension Input Modal */}
      {showDimensionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Enter Package Dimensions</h2>
              <p className="text-sm text-gray-600 mb-6">
                This order has multiple items. Please enter the final package dimensions.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={dimensions.weight}
                    onChange={(e) =>
                      setDimensions({ ...dimensions, weight: parseFloat(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Length (cm)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={dimensions.length}
                      onChange={(e) =>
                        setDimensions({ ...dimensions, length: parseFloat(e.target.value) || 20 })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Breadth (cm)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={dimensions.breadth}
                      onChange={(e) =>
                        setDimensions({ ...dimensions, breadth: parseFloat(e.target.value) || 15 })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Height (cm)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={dimensions.height}
                      onChange={(e) =>
                        setDimensions({ ...dimensions, height: parseFloat(e.target.value) || 10 })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
              <button
                onClick={() => setShowDimensionModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleDimensionSubmit}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
              >
                Confirm & Process
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
