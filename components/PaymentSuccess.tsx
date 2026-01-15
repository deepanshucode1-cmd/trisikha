/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Package, Truck, MapPin, ArrowRight, ExternalLink, ShoppingBag, Sparkles } from "lucide-react";

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/orders/get-order/${orderId}`);
        const data = await res.json();
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#3d3c30] via-[#464433] to-[#3d3c30] text-[#e0dbb5]">
        <div className="relative">
          <div className="h-16 w-16 border-4 border-[#e0dbb5]/20 rounded-full" />
          <div className="absolute inset-0 h-16 w-16 border-4 border-[#e0dbb5] border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="mt-4 text-[#c5c0a0]">Loading order details...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#3d3c30] via-[#464433] to-[#3d3c30] text-[#e0dbb5] px-6">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
          <Package className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Order Not Found</h1>
        <p className="text-[#c5c0a0] mb-6">We couldn&apos;t find your order details.</p>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 bg-[#e0dbb5] text-[#3d3c30] px-6 py-3 rounded-full font-semibold hover:bg-white transition"
        >
          Browse Products
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const status = humanizeStatus(order.order_status, order.shiprocket_status);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#3d3c30] via-[#464433] to-[#3d3c30] text-[#e0dbb5] px-6 py-12 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-10 left-10 opacity-5">
        <Sparkles className="w-32 h-32" />
      </div>
      <div className="absolute bottom-10 right-10 opacity-5">
        <Sparkles className="w-24 h-24" />
      </div>

      <div className="max-w-2xl mx-auto relative z-10">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="relative inline-block">
            <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center animate-scale-in">
              <CheckCircle className="w-14 h-14 text-green-400" />
            </div>
            {/* Decorative rings */}
            <div className="absolute inset-0 w-24 h-24 border-4 border-green-400/20 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mt-6 animate-fade-in-up">Payment Successful!</h1>
          <p className="text-[#c5c0a0] mt-2 animate-fade-in-up animation-delay-100">
            Thank you for shopping with Trishikha Organics
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-[#464433]/80 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden border border-[#6a684d]/30 animate-fade-in-up animation-delay-200">
          {/* Order Details Header */}
          <div className="bg-gradient-to-r from-green-600/20 to-green-500/10 px-6 py-4 border-b border-[#6a684d]/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-green-400" />
                <span className="font-semibold">Order Details</span>
              </div>
              <span className="text-xs bg-green-500/20 text-green-400 px-3 py-1 rounded-full font-medium">
                {status}
              </span>
            </div>
          </div>

          {/* Order Info */}
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-[#6a684d]/30">
              <span className="text-[#c5c0a0]">Order ID</span>
              <span className="font-mono text-sm bg-[#3d3c30] px-3 py-1 rounded-lg">{order.id}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-[#6a684d]/30">
              <span className="text-[#c5c0a0]">Amount Paid</span>
              <span className="text-2xl font-bold text-[#e0dbb5]">₹{order.total_amount}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-[#c5c0a0]">Status</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="font-medium">{status}</span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-[#3d3c30]/50 px-6 py-5 border-t border-[#6a684d]/30">
            <p className="font-semibold mb-4 flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#bdb88c]" />
              What happens next?
            </p>
            <div className="space-y-4">
              {[
                { icon: CheckCircle, text: "Your order has been confirmed", done: true },
                { icon: Package, text: "Courier will be assigned shortly", done: false },
                { icon: MapPin, text: "You'll receive tracking details once dispatched", done: false }
              ].map((step, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${step.done ? 'bg-green-500/20' : 'bg-[#6a684d]/30'}`}>
                    <step.icon className={`w-4 h-4 ${step.done ? 'text-green-400' : 'text-[#bdb88c]'}`} />
                  </div>
                  <span className={`text-sm pt-1.5 ${step.done ? 'text-[#e0dbb5]' : 'text-[#c5c0a0]'}`}>
                    {step.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-6 border-t border-[#6a684d]/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link
                href={`/track?order_id=${order.id}`}
                className="flex items-center justify-center gap-2 bg-[#e0dbb5] text-[#3d3c30] px-6 py-3.5 rounded-xl font-semibold hover:bg-white transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                <MapPin className="w-4 h-4" />
                Track Order
              </Link>
              {order.awb_code && order.tracking_url && (
                <a
                  href={order.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 border-2 border-[#6a684d] hover:bg-[#3d3c30] px-6 py-3.5 rounded-xl font-semibold transition-all duration-300"
                >
                  <ExternalLink className="w-4 h-4" />
                  Courier Website
                </a>
              )}
            </div>

            <Link
              href="/products"
              className="flex items-center justify-center gap-2 text-[#bdb88c] hover:text-[#e0dbb5] mt-6 transition-colors group"
            >
              <ShoppingBag className="w-4 h-4" />
              Continue Shopping
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        {/* Help Text */}
        <p className="text-center text-sm text-[#8a8778] mt-8">
          Questions about your order? <a href="/contact" className="text-[#bdb88c] hover:text-[#e0dbb5] underline">Contact support</a>
        </p>
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
