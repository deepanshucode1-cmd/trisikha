"use client";

import { useEffect, useState } from "react";
import { useCartStore } from "@/utils/store/cartStore";
import Link from "next/link";

const states = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal"
];

export default function CheckoutPage() {
  const { items, clearCart } = useCartStore();
  const [sameAsShipping, setSameAsShipping] = useState(true);

  const [shipping, setShipping] = useState({
    firstName: "",
    lastName: "",
    address: "",
    apartment: "",
    city: "",
    state: "",
    pincode: "",
    phone: "",
  });

  const [billing, setBilling] = useState({
    firstName: "",
    lastName: "",
    address: "",
    apartment: "",
    city: "",
    state: "",
    pincode: "",
    phone: "",
  });

  const [email, setEmail] = useState("");

  useEffect(() => {
  if (!(window as any).Razorpay) {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }
}, []);


  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    section: "shipping" | "billing"
  ) => {
    const { name, value } = e.target;
    section === "shipping"
      ? setShipping({ ...shipping, [name]: value })
      : setBilling({ ...billing, [name]: value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const finalBilling = sameAsShipping ? shipping : billing;
    const payload = {
      email,
      shipping,
      billing: finalBilling,
      items,
      total,
    };

    console.log("Checkout payload:", payload);
    // TODO: Add Supabase insert + payment redirect

    const result = fetch('/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        guest_email: email,
        cart_items: items,
        total_amount: total,
        shipping_address: {
          name: `${shipping.firstName} ${shipping.lastName}`,
          address_line1: shipping.address,
          address_line2: shipping.apartment,
          city: shipping.city,
          state: shipping.state,
          pincode: shipping.pincode,
          country: "India",
        },
        billing_address: {
          name: `${finalBilling.firstName} ${finalBilling.lastName}`,
          address_line1: finalBilling.address,
          address_line2: finalBilling.apartment,
          city: finalBilling.city,
          state: finalBilling.state,
          pincode: finalBilling.pincode,
          country: "India",
        },
      }),
    });

    result.then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        console.log("Checkout response:", data);
        const options = {
  key: data.key, // from backend
  amount: data.amount * 100,
  currency: data.currency,
  order_id: data.razorpay_order_id,
  name: "Organic Bazar",
  description: "Order Payment",
  handler: async function () {
    // Called when payment is successful

  },
  prefill: {
    email: data.email,
    contact: data.phone
  },
  theme: { color: "#2f2e25" }
};

    console.log("Razorpay options:", options);
    const razorpay = new (window as any).Razorpay(options);
    razorpay.open();
    console.log("Razorpay checkout opened");


        // Redirect to payment gateway or confirmation page
        //window.location.href = data.payment_url;
      } else {
        const errorData = await res.json();
        console.error("Checkout error:", errorData);
        alert("An error occurred during checkout. Please try again.");
      }
    }).catch((error) => {
      console.error("Fetch error:", error);
      alert("An error occurred during checkout. Please try again.");
    });

  };

  return (
    <div className="bg-[#3d3c30] text-[#e0dbb5] min-h-screen py-12 px-6 md:px-20">
      <h1 className="text-4xl font-bold mb-10 text-center">Checkout</h1>

      {items.length === 0 ? (
        <div className="text-center text-lg">
          <p>Your cart is empty.</p>
          <Link href="/products" className="underline text-[#d1cd9f]">
            Continue Shopping
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-[#464433] rounded-2xl p-8 max-w-4xl mx-auto shadow-lg"
        >
          {/* Email */}
          <div className="mb-6">
            <label className="block mb-2 text-lg font-semibold">Email</label>
            <input
              type="email"
              name="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#3d3c30] border border-[#6a684d] text-[#e0dbb5] rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#d1cd9f] outline-none"
            />
          </div>

          {/* Shipping Section */}
          <h2 className="text-2xl font-semibold mb-4">Shipping Address</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm mb-1">First Name</label>
              <input
                name="firstName"
                value={shipping.firstName}
                onChange={(e) => handleChange(e, "shipping")}
                className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Last Name</label>
              <input
                name="lastName"
                value={shipping.lastName}
                onChange={(e) => handleChange(e, "shipping")}
                className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm mb-1">Address</label>
            <input
              name="address"
              required
              value={shipping.address}
              onChange={(e) => handleChange(e, "shipping")}
              className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm mb-1">Apartment, suite, etc. (optional)</label>
            <input
              name="apartment"
              value={shipping.apartment}
              onChange={(e) => handleChange(e, "shipping")}
              className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm mb-1">City</label>
              <input
                name="city"
                required
                value={shipping.city}
                onChange={(e) => handleChange(e, "shipping")}
                className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
              />
            </div>

            <div>
              <label className="block text-sm mb-1">State</label>
              <select
                name="state"
                required
                value={shipping.state}
                onChange={(e) => handleChange(e, "shipping")}
                className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
              >
                <option value="">Select</option>
                {states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm mb-1">PIN code</label>
              <input
                name="pincode"
                required
                value={shipping.pincode}
                onChange={(e) => handleChange(e, "shipping")}
                className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
              />
            </div>
          </div>

          <div className="mb-8">
            <label className="block text-sm mb-1">Phone</label>
            <input
              name="phone"
              required
              value={shipping.phone}
              onChange={(e) => handleChange(e, "shipping")}
              className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
            />
          </div>

          {/* Billing Section */}
          <div className="flex items-center mb-4">
            <input
              id="sameAsShipping"
              type="checkbox"
              checked={sameAsShipping}
              onChange={() => setSameAsShipping(!sameAsShipping)}
              className="mr-2 accent-[#d1cd9f]"
            />
            <label htmlFor="sameAsShipping" className="text-lg font-semibold">
              Billing address same as shipping
            </label>
          </div>

          {!sameAsShipping && (
            <div className="mt-4">
              <h2 className="text-2xl font-semibold mb-4">Billing Address</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm mb-1">First Name</label>
                  <input
                    name="firstName"
                    value={billing.firstName}
                    onChange={(e) => handleChange(e, "billing")}
                    className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Last Name</label>
                  <input
                    name="lastName"
                    value={billing.lastName}
                    onChange={(e) => handleChange(e, "billing")}
                    className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm mb-1">Address</label>
                <input
                  name="address"
                  required
                  value={billing.address}
                  onChange={(e) => handleChange(e, "billing")}
                  className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm mb-1">Apartment, suite, etc. (optional)</label>
                <input
                  name="apartment"
                  value={billing.apartment}
                  onChange={(e) => handleChange(e, "billing")}
                  className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm mb-1">City</label>
                  <input
                    name="city"
                    required
                    value={billing.city}
                    onChange={(e) => handleChange(e, "billing")}
                    className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1">State</label>
                  <select
                    name="state"
                    required
                    value={billing.state}
                    onChange={(e) => handleChange(e, "billing")}
                    className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
                  >
                    <option value="">Select</option>
                    {states.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm mb-1">PIN code</label>
                  <input
                    name="pincode"
                    required
                    value={billing.pincode}
                    onChange={(e) => handleChange(e, "billing")}
                    className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
                  />
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-sm mb-1">Phone</label>
                <input
                  name="phone"
                  required
                  value={billing.phone}
                  onChange={(e) => handleChange(e, "billing")}
                  className="w-full bg-[#3d3c30] border border-[#6a684d] rounded-lg px-4 py-2 text-[#e0dbb5]"
                />
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="bg-[#3d3c30] border border-[#6a684d] rounded-xl p-4 mb-8">
            <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
            {items.map((item) => (
              <div key={item.id} className="flex justify-between text-[#e0dbb5] mb-2">
                <span>
                  {item.name} × {item.quantity}
                </span>
                <span>₹{item.price * item.quantity}</span>
              </div>
            ))}
            <hr className="border-[#6a684d] my-3" />
            <div className="flex justify-between font-semibold text-lg">
              <span>Total</span>
              <span>₹{total}</span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={clearCart}
              className="text-[#e0dbb5] underline hover:text-[#d1cd9f]"
            >
              Clear Cart
            </button>

            <button
              type="submit"
              className="bg-[#4f4d3e] hover:bg-[#6a684d] text-[#e0dbb5] px-6 py-3 rounded-full transition"
            >
              Place Order
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
