/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  console.log("Order ID:", orderId);

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/orders/get-order/${orderId}`);
        const data = await res.json();
        console.log("Fetched order data:", data);
        setOrder(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#3d3c30] text-[#e0dbb5]">
        Loading order details...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#3d3c30] text-red-400">
        Order not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#3d3c30] text-[#e0dbb5] px-6 py-12">
      <div className="max-w-3xl mx-auto bg-[#464433] rounded-2xl p-8 shadow-lg">

        {/* SUCCESS ICON */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">✅</div>
          <h1 className="text-3xl font-bold">Payment Successful</h1>
          <p className="text-sm text-[#cfcaa0] mt-2">
            Thank you for shopping with Trishikha Organics
          </p>
        </div>

        {/* ORDER DETAILS */}
        <div className="border border-[#6a684d] rounded-xl p-4 mb-6">
          <p className="text-sm mb-1">
            <span className="text-[#cfcaa0]">Order ID:</span>{" "}
            <span className="font-semibold">{order.id}</span>
          </p>

          <p className="text-sm mb-1">
            <span className="text-[#cfcaa0]">Amount Paid:</span> ₹{order.total_amount}
          </p>

          <p className="text-sm">
            <span className="text-[#cfcaa0]">Current Status:</span>{" "}
            {humanizeStatus(order.order_status, order.shiprocket_status)}
          </p>
        </div>

        {/* WHAT HAPPENS NEXT */}
        <div className="bg-[#3d3c30] border border-[#6a684d] rounded-xl p-4 mb-6 text-sm">
          <p className="mb-2 font-semibold">What happens next?</p>
          <ul className="list-disc list-inside text-[#cfcaa0] space-y-1">
            <li>Your order has been confirmed</li>
            <li>Courier will be assigned shortly</li>
            <li>You’ll receive tracking details once dispatched</li>
          </ul>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <Link
            href={`/track?order_id=${order.id}`}
            className="text-center bg-[#4f4d3e] hover:bg-[#6a684d] text-[#e0dbb5] px-6 py-3 rounded-full transition"
          >
            Track Order
          </Link>

          {order.awb_code && order.tracking_url && (
            <a
              href={order.tracking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center border border-[#6a684d] hover:bg-[#4f4d3e] px-6 py-3 rounded-full transition"
            >
              Track on Courier Website
            </a>
          )}

          <Link
            href="/products"
            className="text-center underline text-[#d1cd9f]"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---------------- UTIL ---------------- */

function humanizeStatus(orderStatus: string, shiprocketStatus?: string) {
  if (shiprocketStatus === "DELIVERED") return "Delivered";
  if (shiprocketStatus === "IN_TRANSIT") return "In Transit";
  if (shiprocketStatus === "READY_TO_SHIP") return "Ready to Ship";
  if (orderStatus === "CONFIRMED") return "Order Confirmed";
  return "Processing";
}
