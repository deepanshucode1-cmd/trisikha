import { notFound } from "next/navigation";
import { createServiceClient } from "@/utils/supabase/service";
import { hashResumeToken } from "@/lib/resume-token";
import PayButton from "./PayButton";

export const dynamic = "force-dynamic";

type Item = {
  product_name: string;
  quantity: number;
  unit_price: number;
};

type ResumeOrder = {
  id: string;
  total_amount: number;
  subtotal_amount: number;
  shipping_cost: number;
  taxable_amount: number | null;
  cgst_amount: number | null;
  sgst_amount: number | null;
  igst_amount: number | null;
  total_gst_amount: number | null;
  supply_type: string | null;
  guest_email: string;
  guest_phone: string;
  shipping_first_name: string;
  shipping_last_name: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  shipping_city: string;
  shipping_state: string;
  shipping_pincode: string;
  shipping_country: string;
  razorpay_order_id: string;
  resume_token_expires_at: string;
  resume_token_used_at: string | null;
  order_status: string;
  payment_status: string;
};

async function fetchByToken(rawToken: string): Promise<{
  order: ResumeOrder | null;
  items: Item[];
  reason?: "not_found" | "expired" | "used" | "already_paid" | "wrong_status";
}> {
  const hash = hashResumeToken(rawToken);
  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, total_amount, subtotal_amount, shipping_cost, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_gst_amount, supply_type, guest_email, guest_phone, shipping_first_name, shipping_last_name, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_pincode, shipping_country, razorpay_order_id, resume_token_expires_at, resume_token_used_at, order_status, payment_status"
    )
    .eq("resume_token_hash", hash)
    .maybeSingle();

  if (!order) return { order: null, items: [], reason: "not_found" };

  if (order.resume_token_used_at) {
    return { order: null, items: [], reason: "used" };
  }

  if (new Date(order.resume_token_expires_at) < new Date()) {
    return { order: null, items: [], reason: "expired" };
  }

  if (order.payment_status === "paid") {
    return { order: null, items: [], reason: "already_paid" };
  }

  if (order.order_status !== "CHECKED_OUT" || order.payment_status !== "initiated") {
    return { order: null, items: [], reason: "wrong_status" };
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("product_name, quantity, unit_price")
    .eq("order_id", order.id);

  return { order: order as ResumeOrder, items: (items as Item[]) || [] };
}

function ErrorState({ title, message }: { title: string; message: string }) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
  return (
    <div className="max-w-xl mx-auto p-8 text-center">
      <h1 className="text-2xl font-semibold text-gray-800 mb-3">{title}</h1>
      <p className="text-gray-600 mb-6">{message}</p>
      <a
        href={`${baseUrl}/products`}
        className="inline-block bg-[#3d3c30] text-white px-6 py-3 rounded-lg font-medium"
      >
        Browse Products
      </a>
    </div>
  );
}

export default async function ResumePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!token) notFound();

  const { order, items, reason } = await fetchByToken(token);

  if (!order) {
    if (reason === "already_paid") {
      return (
        <ErrorState
          title="This order is already paid"
          message="There's nothing to resume for this checkout. If you have questions, please contact support."
        />
      );
    }
    if (reason === "used") {
      return (
        <ErrorState
          title="This link has already been used"
          message="The cart resume link can only be used once. If you didn't complete the payment, please place a new order."
        />
      );
    }
    if (reason === "expired") {
      return (
        <ErrorState
          title="This link has expired"
          message="Cart resume links are valid for 7 days. Please place a new order to continue shopping."
        />
      );
    }
    return (
      <ErrorState
        title="Link not found"
        message="This cart resume link is invalid or the cart has been cleared. Please place a new order."
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-semibold text-gray-800 mb-2">Resume Your Checkout</h1>
      <p className="text-gray-600 mb-8">Review your cart below and complete payment to confirm your order.</p>

      <section className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Items</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-600 border-b">
            <tr>
              <th className="py-2">Product</th>
              <th className="py-2 text-center">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b last:border-0">
                <td className="py-3">{item.product_name}</td>
                <td className="py-3 text-center">{item.quantity}</td>
                <td className="py-3 text-right">Rs {item.unit_price.toFixed(2)}</td>
                <td className="py-3 text-right">Rs {(item.unit_price * item.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 space-y-1 text-sm text-gray-700">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>Rs {order.subtotal_amount.toFixed(2)}</span>
          </div>
          {order.shipping_cost > 0 && (
            <div className="flex justify-between">
              <span>Shipping</span>
              <span>Rs {order.shipping_cost.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-base pt-2 border-t mt-2">
            <span>Total</span>
            <span>Rs {order.total_amount.toFixed(2)}</span>
          </div>
          {order.total_gst_amount && order.total_gst_amount > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              Total includes {order.supply_type === "interstate" ? "IGST" : "CGST + SGST"} of Rs {order.total_gst_amount.toFixed(2)}.
            </p>
          )}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Shipping To</h2>
        <div className="text-sm text-gray-700 space-y-1">
          <p className="font-medium text-gray-800">
            {order.shipping_first_name} {order.shipping_last_name}
          </p>
          <p>{order.shipping_address_line1}</p>
          {order.shipping_address_line2 && <p>{order.shipping_address_line2}</p>}
          <p>
            {order.shipping_city}, {order.shipping_state} {order.shipping_pincode}
          </p>
          <p>{order.shipping_country}</p>
          <p className="pt-2">Phone: {order.guest_phone}</p>
          <p>Email: {order.guest_email}</p>
        </div>
      </section>

      <PayButton
        token={token}
        prefillEmail={order.guest_email}
        prefillContact={order.guest_phone}
      />

      <p className="text-xs text-gray-500 text-center mt-6">
        Items shown above were locked into your cart at checkout. Address cannot be edited from this page —
        if you need a different address, please place a new order.
      </p>
    </div>
  );
}
