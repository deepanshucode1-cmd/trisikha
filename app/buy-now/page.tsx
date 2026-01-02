/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { use, useEffect, useRef, useState } from "react";
import { useCartStore } from "@/utils/store/cartStore";
import Link from "next/link";
import  {useRouter} from 'next/navigation';
import ProgressBar from "@/components/ProgressBar";
import { createClient } from "@/utils/supabase/client";
import { toast } from "react-toastify";
import React from "react";

const states = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal"
];

export default function BuyNowPage({searchParams}: {searchParams: Promise<{productId: string}>}  ) {
  
    const [items,setItems] = useState<any[]>([]);
  const {productId} = React.use(searchParams);
  console.log("BuyNowPage productId:", productId);  
  useEffect(() => {
      const fetchProducts = async () => {
            const supabase = await createClient();
            const { data, error: err } = await supabase.from('products').select('*').eq('id', productId);
            if (err) {
              console.log(err);
              toast.error("An error occurred");
              return;
            }
            console.log("Fetched product for BuyNowPage:", data);
            console.log("product fetch error:", err);
            setItems(data || []);
          };
      
          fetchProducts();
       
    console.log("BuyNowPage mounted with productId:", productId);
  }, [productId]);
  
  const router = useRouter();
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);


  const [shippingOptions, setShippingOptions] = useState<any[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<any | null>(null);
  const [shippingCharge, setShippingCharge] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [shippingCalculated, setShippingCalculated] = useState(false);


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

  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
  if (!(window as any).Razorpay) {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }
}, []);

const calculateShipping = async (pincode: string) => {
  try {
    setEstimating(true);
    setShippingCalculated(false);
    const cart_items = items.map(item => ({ 
  ...item, 
  quantity: 1 
}));


    const res = await fetch("/api/seller/shiprocket/estimate-shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination_pincode: pincode,
        cart_items: cart_items,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      setShippingOptions(data.couriers);

      // Auto select cheapest
      const first = data.couriers[0];
      setSelectedCourier(first);
      setShippingCharge(first.rate);
      setShippingCalculated(true);
    } else {
      alert(data.error || "Could not estimate shipping cost");
    }
  } finally {
    setEstimating(false);
  }
};



  const total = items.reduce((sum, item) => sum + item.price * 1, 0) + (shippingCharge || 0);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    section: "shipping" | "billing"
  ) => {
    const { name, value } = e.target;
    section === "shipping"
      ? setShipping({ ...shipping, [name]: value })
      : setBilling({ ...billing, [name]: value });
  };

  const pincodeRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

useEffect(() => {
  // Check if pincode is valid (exactly 6 digits for India)
  // and we haven't already calculated shipping for this specific pincode
  if (shipping.pincode.length === 6 && !shippingCalculated) {
    calculateShipping(shipping.pincode);
  } else if (shipping.pincode.length !== 6 && shippingCalculated) {
    // Reset if they change it to something invalid
    setShippingCalculated(false);
    setShippingCharge(null);
  }
}, [shipping.pincode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (placingOrder) return; // Prevent multiple submissions
    setPlacingOrder(true);

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
        guest_phone: shipping.phone,
        cart_items: items,
        total_amount: total,
        shipping_address: {
          first_name : shipping.firstName,
          last_name : shipping.lastName,
          address_line1: shipping.address,
          address_line2: shipping.apartment,
          city: shipping.city,
          state: shipping.state,
          pincode: shipping.pincode,
          country: "India",
        },
        billing_address: {
          first_name: finalBilling.firstName,
          last_name: finalBilling.lastName,
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
  name: "Trishikha Organics",
  description: "Order Payment",
 handler: async function (response: any) {
  console.log("Razorpay payment success:", response);

  setVerifying(true);

  try {
    const verifyRes = await fetch("/api/payment/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: data.order_id, // YOUR DB ORDER ID
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      }),
    });

    const verifyData = await verifyRes.json();

    if (verifyRes.ok) {
      router.push(`/payment/success?orderId=${data.order_id}`);
    } else {
      
      console.error("Verification failed:", verifyData);
      router.push(`/payment/failed?reason=verification_failed`);
    }
  } catch (err) {
    console.error("Verification error:", err);
    router.push(`/payment/failed?reason=server_error`);
  }
},
  prefill: {
    email: data.email,
    contact: data.phone
  },
  modal: {
    ondismiss: function () {
      router.push(`/payment/failed?reason=cancelled`);
    },
  },
  theme: { color: "#2f2e25" }
};

    console.log("Razorpay options:", options);
    const razorpay = new (window as any).Razorpay(options);
    razorpay.on("payment.failed", function () {
    router.push(`/payment/failed?reason=failed`);
  });
    razorpay.open();
    console.log("Razorpay checkout opened");


        // Redirect to payment gateway or confirmation page
        //window.location.href = data.payment_url;
      } else {
        setPlacingOrder(false);
        const errorData = await res.json();
        console.error("Checkout error:", errorData);
        alert("An error occurred during checkout. Please try again.");
      }
    }).catch((error) => {
      setPlacingOrder(false);
      console.error("Fetch error:", error);
      alert("An error occurred during checkout. Please try again.");
    });

  };

  return (
    <div className="bg-[#3d3c30] text-[#e0dbb5] min-h-screen py-12 px-6 md:px-20">
      <h1 className="text-4xl font-bold mb-10 text-center">Checkout</h1>

        {verifying && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-live="polite"
  >
    <div className="bg-[#3d3c30] border border-[#6a684d] rounded-2xl shadow-2xl p-8 w-[90%] max-w-sm text-center">
      
      {/* Spinner */}
      <div className="flex justify-center mb-5">
        <div className="h-12 w-12 rounded-full border-4 border-[#6a684d] border-t-[#d1cd9f] animate-spin" />
      </div>

      {/* Title */}
      <h2 className="text-xl font-semibold text-[#e0dbb5]">
        Verifying Payment
      </h2>

      {/* Description */}
      <p className="text-sm text-[#d1cd9f] mt-3 leading-relaxed">
        Please wait while we securely confirm your payment.
        <br />
        <span className="text-[#bfb98f]">
          Do not refresh or close this page.
        </span>
      </p>

      {/* Trust hint */}
      <div className="mt-5 text-xs text-[#9f9b7a]">
        This may take a few seconds ⏳
      </div>
    </div>
  </div>
)}


      {items.length === 0 ? (
        <div className="text-center text-lg">
          <p>Your cart is empty.</p>
          <Link href="/products" className="underline text-[#d1cd9f]">
            Continue Shopping
          </Link>
        </div>
      ) : (
        <form
          ref = {formRef}
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
                autoComplete="postal-code"
                required
                ref = {pincodeRef}
                value={shipping.pincode}
                onBlur={() => {
                  if (shipping.pincode.length === 6) {
                    calculateShipping(shipping.pincode);
                  }
                }}
                onChange={(e) => {handleChange(e, "shipping")
                  }

                }
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

          {estimating && (
  <p className="text-sm text-yellow-500">Calculating shipping…</p>
)}



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

          {shippingOptions.length > 0 && (
  <div className="mb-6 bg-[#3d3c30] p-3 border border-[#6a684d] rounded-lg">
    <label className="block mb-2 text-sm font-medium">
      Select Shipping Courier
    </label>
    <select
      className="bg-black border border-[#6a684d] rounded-lg w-full p-2"
      value={selectedCourier?.id}
      onChange={(e) => {
        const selected = shippingOptions.find(
          (c) => c.id == e.target.value
        );
        setSelectedCourier(selected);
        setShippingCharge(selected.rate);
      }}
    >
      {shippingOptions.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} – ₹{c.rate} ({c.etd || "ETA N/A"})
        </option>
      ))}
    </select>
  </div>
)}


          {/* Order Summary */}
          <div className="bg-[#3d3c30] border border-[#6a684d] rounded-xl p-4 mb-8">
            <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
            {items.map((item) => (
              <div key={item.id} className="flex justify-between text-[#e0dbb5] mb-2">
                <span>
                  {item.name} × {1}
                </span>
                <span>₹{item.price * 1}</span>
              </div>
            ))}
            <hr className="border-[#6a684d] my-3" />
            

            {shippingCharge !== null && (
              <div className="flex justify-between text-[#e0dbb5] mb-2">
                <span>Shipping</span>
                <span>₹{shippingCharge}</span>
              </div>
          )}

          <div className="flex justify-between font-semibold text-lg">
              <span>Total</span>
              <span>₹{total}</span>
            </div>

            {selectedCourier?.etd && (
               <div className="text-xs text-[#d0cca8] mb-2">
                Estimated delivery: {selectedCourier.etd}
              </div>
        )}

          </div>

          {/* Buttons */}
          <div className="flex justify-between items-center">
            {placingOrder ? (
            <ProgressBar/>
          ) : (
        <button
              type="submit"
              disabled={!shippingCalculated || estimating}
              className={`${
                shippingCalculated ? "bg-[#4f4d3e]" : "bg-gray-600 cursor-not-allowed"
                } text-[#e0dbb5] px-6 py-3 rounded-full`}
              >
                Place Order
              </button>
      )}
          </div>
        </form>
      
      )}
    </div>
  );
}
