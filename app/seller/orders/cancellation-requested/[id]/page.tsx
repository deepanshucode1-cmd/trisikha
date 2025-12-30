"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

export default function SellerOrderDetails (){
    const params = useParams();
  const orderId = params?.id as string;
  
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/orders/get-order-detail/${orderId}`);
        const json = await res.json();

        setOrder(json.order);
        setItems(json.items);
      } catch (err) {
        console.error("Error fetching order:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  if (loading) return <p className="p-6">Loading...</p>;
  if (!order) return <p className="p-6">Order not found.</p>;


  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">
          Order #{order.order_number}
        </h1>
        <Link href="/admin/orders" className="text-blue-600 underline">
          Back
        </Link>
      </div>

      {/* ORDER SUMMARY */}
      <div className="bg-white shadow rounded-2xl p-4 space-y-2">
        <h2 className="text-lg font-semibold">Order Summary</h2>
        <p><strong>Order id:</strong> {order.id}</p>
        <p><strong>Date:</strong> {new Date(order.created_at).toLocaleString()}</p>

        <p><strong>Total Amount:</strong> ₹{order.total_amount}</p>
        <p><strong>Payment:</strong> {order.payment_status}</p>
        <p><strong>Shipping Status:</strong> {order.shiprocket_status}</p>
        <p><strong>Order Status:</strong> {order.order_status}</p>
        <p><strong>Cancellation Status:</strong> {order.cancellation_status}</p>
        <p><strong>Refund Status:</strong> {order.refund_status}</p>
        <p><strong>Refund error code:</strong> {order.refund_error_code}</p>
        <p><strong>Refund error reason:</strong> {order.refund_error_reason}</p>
        <p><strong>Refund error description:</strong> {order.refund_error_description}</p>
        {order.awb_code && (
          <p><strong>AWB:</strong> {order.awb_code}</p>
        )}
      </div>

      {/* CUSTOMER */}
      <div className="bg-white shadow rounded-2xl p-4">
        <h2 className="text-lg font-semibold mb-3">Customer Details</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold">Shipping</h3>
            <p>{order.shipping_first_name} {order.shipping_last_name}</p>
            <p>{order.shipping_address_line1}</p>
            <p>{order.shipping_city}, {order.shipping_state}</p>
            <p>{order.shipping_pincode}</p>
            <p>Phone: {order.guest_phone}</p>
          </div>

          <div>
            <h3 className="font-semibold">Billing</h3>
            <p>{order.billing_first_name} {order.billing_last_name}</p>
            <p>{order.billing_address_line1}</p>
            <p>{order.billing_city}, {order.billing_state}</p>
            <p>{order.billing_pincode}</p>
          </div>
        </div>
      </div>

      {/* ITEMS */}
      <div className="bg-white shadow rounded-2xl p-4">
        <h2 className="text-lg font-semibold mb-3">Items</h2>

        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between border-b pb-2"
            >
              <div>
                <p className="font-medium">{item.product_name}</p>
                <p className="text-gray-600 text-sm">
                  Qty: {item.quantity}
                </p>
              </div>

              <p className="font-semibold">₹{item.price}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ACTIONS */}
      <div className="bg-white shadow rounded-2xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Actions</h2>

      </div>
    </div>
  );
}
