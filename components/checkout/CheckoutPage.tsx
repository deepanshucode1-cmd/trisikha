/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useCartStore } from "@/utils/store/cartStore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";

// Validation rules based on backend schema
interface ValidationRule {
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  message: string;
}

const validation: Record<string, ValidationRule> = {
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    maxLength: 255,
    message: "Please enter a valid email address",
  },
  phone: {
    pattern: /^[0-9]{10,15}$/,
    message: "Phone must be 10-15 digits",
  },
  firstName: {
    pattern: /^[a-zA-Z\s.'-]+$/,
    minLength: 1,
    maxLength: 50,
    message: "First name is required (letters only, max 50 chars)",
  },
  lastName: {
    pattern: /^[a-zA-Z\s.'-]*$/,
    maxLength: 50,
    message: "Last name can only contain letters (max 50 chars)",
  },
  address: {
    minLength: 5,
    maxLength: 200,
    message: "Address must be 5-200 characters",
  },
  apartment: {
    maxLength: 200,
    message: "Max 200 characters",
  },
  city: {
    minLength: 2,
    maxLength: 100,
    message: "City must be 2-100 characters",
  },
  pincode: {
    pattern: /^[0-9]{6}$/,
    message: "Pincode must be exactly 6 digits",
  },
};

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

  // Validation errors state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Validation helper functions
  const validateField = useCallback((field: string, value: string, isRequired = true): string => {
    if (!value && isRequired) {
      return `${field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, " $1")} is required`;
    }
    if (!value && !isRequired) return "";

    const rules = validation[field];
    if (!rules) return "";

    if (rules.minLength !== undefined && value.length < rules.minLength) {
      return rules.message;
    }
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      return rules.message;
    }
    if (rules.pattern && !rules.pattern.test(value)) {
      return rules.message;
    }
    return "";
  }, []);

  const handleBlur = (field: string, value: string, isRequired = true) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const error = validateField(field, value, isRequired);
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const validateAllFields = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    // Email
    newErrors.email = validateField("email", email);

    // Shipping fields
    newErrors.firstName = validateField("firstName", shipping.firstName);
    newErrors.lastName = validateField("lastName", shipping.lastName, false);
    newErrors.address = validateField("address", shipping.address);
    newErrors.apartment = validateField("apartment", shipping.apartment, false);
    newErrors.city = validateField("city", shipping.city);
    newErrors.pincode = validateField("pincode", shipping.pincode);
    newErrors.phone = validateField("phone", shipping.phone);

    if (!shipping.state) {
      newErrors.state = "Please select a state";
    }

    // Billing fields (if different)
    if (!sameAsShipping) {
      newErrors.billingFirstName = validateField("firstName", billing.firstName);
      newErrors.billingLastName = validateField("lastName", billing.lastName, false);
      newErrors.billingAddress = validateField("address", billing.address);
      newErrors.billingApartment = validateField("apartment", billing.apartment, false);
      newErrors.billingCity = validateField("city", billing.city);
      newErrors.billingPincode = validateField("pincode", billing.pincode);
      newErrors.billingPhone = validateField("phone", billing.phone);

      if (!billing.state) {
        newErrors.billingState = "Please select a state";
      }
    }

    setErrors(newErrors);
    setTouched(Object.keys(newErrors).reduce((acc, key) => ({ ...acc, [key]: true }), {}));

    return !Object.values(newErrors).some((error) => error !== "");
  }, [email, shipping, billing, sameAsShipping, validateField]);

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

      const res = await fetch("/api/seller/shiprocket/estimate-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination_pincode: pincode,
          cart_items: items,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setShippingOptions(data.couriers);
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

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal + (shippingCharge || 0);

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
    if (shipping.pincode.length === 6 && !shippingCalculated) {
      calculateShipping(shipping.pincode);
    } else if (shipping.pincode.length !== 6 && shippingCalculated) {
      setShippingCalculated(false);
      setShippingCharge(null);
    }
  }, [shipping.pincode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (placingOrder) return;

    // Validate all fields before submitting
    if (!validateAllFields()) {
      return;
    }

    setPlacingOrder(true);

    const finalBilling = sameAsShipping ? shipping : billing;

    const result = fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guest_email: email,
        guest_phone: shipping.phone,
        cart_items: items,
        total_amount: total,
        shipping_address: {
          first_name: shipping.firstName,
          last_name: shipping.lastName,
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
        selected_courier: selectedCourier,
      }),
    });

    result
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const options = {
            key: data.key,
            amount: data.amount * 100,
            currency: data.currency,
            order_id: data.razorpay_order_id,
            name: "Trishikha Organics",
            description: "Order Payment",
            handler: async function (response: any) {
              setVerifying(true);
              try {
                const verifyRes = await fetch("/api/payment/verify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    order_id: data.order_id,
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                  }),
                });

                const verifyData = await verifyRes.json();

                if (verifyRes.ok) {
                  clearCart();
                  router.push(`/payment/success?orderId=${data.order_id}?email=${email}`);
                  setVerifying(false);
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
              contact: data.phone,
            },
            modal: {
              ondismiss: function () {
                router.push(`/payment/failed?reason=cancelled`);
              },
            },
            theme: { color: "#3d3c30" },
          };

          const razorpay = new (window as any).Razorpay(options);
          razorpay.on("payment.failed", function () {
            router.push(`/payment/failed?reason=failed`);
          });
          razorpay.open();
        } else {
          setPlacingOrder(false);
          const errorData = await res.json();
          console.error("Checkout error:", errorData);
          alert("An error occurred during checkout. Please try again.");
        }
      })
      .catch((error) => {
        setPlacingOrder(false);
        console.error("Fetch error:", error);
        alert("An error occurred during checkout. Please try again.");
      });
  };

  const getInputClasses = (fieldName: string) =>
    `w-full bg-white border text-gray-800 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#3d3c30] focus:border-transparent outline-none transition-all ${
      touched[fieldName] && errors[fieldName]
        ? "border-red-500 focus:ring-red-500"
        : "border-gray-300"
    }`;
  const labelClasses = "block text-sm font-medium text-gray-700 mb-1.5";

  const ErrorMessage = ({ field }: { field: string }) =>
    touched[field] && errors[field] ? (
      <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        {errors[field]}
      </p>
    ) : null;

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      {/* Header */}
      <div className="bg-[#3d3c30] text-[#e0dbb5] py-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <Link href="/" className="inline-flex items-center gap-2 text-sm hover:text-white transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to store
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold">Checkout</h1>
        </div>
      </div>

      {/* Verifying Modal */}
      {verifying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-[90%] max-w-sm text-center">
            <div className="flex justify-center mb-5">
              <div className="h-12 w-12 rounded-full border-4 border-gray-200 border-t-[#3d3c30] animate-spin" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800">Verifying Payment</h2>
            <p className="text-sm text-gray-600 mt-3">
              Please wait while we securely confirm your payment.
              <br />
              <span className="text-gray-500">Do not refresh or close this page.</span>
            </p>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Your cart is empty</h2>
          <p className="text-gray-600 mb-6">Add some products to get started</p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 bg-[#3d3c30] text-white px-6 py-3 rounded-full hover:bg-[#4a493a] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            Continue Shopping
          </Link>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form Section */}
            <div className="lg:col-span-2">
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
                {/* Contact Section */}
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 bg-[#3d3c30] text-white rounded-full flex items-center justify-center text-sm">1</span>
                    Contact Information
                  </h2>
                  <div>
                    <label className={labelClasses}>Email Address</label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => handleBlur("email", email)}
                      placeholder="your@email.com"
                      maxLength={255}
                      className={getInputClasses("email")}
                    />
                    <ErrorMessage field="email" />
                    {!errors.email && <p className="text-xs text-gray-500 mt-1">We&apos;ll send your order confirmation here</p>}
                  </div>
                </div>

                {/* Shipping Section */}
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 bg-[#3d3c30] text-white rounded-full flex items-center justify-center text-sm">2</span>
                    Shipping Address
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className={labelClasses}>First Name</label>
                      <input
                        name="firstName"
                        required
                        value={shipping.firstName}
                        onChange={(e) => handleChange(e, "shipping")}
                        onBlur={() => handleBlur("firstName", shipping.firstName)}
                        maxLength={50}
                        className={getInputClasses("firstName")}
                      />
                      <ErrorMessage field="firstName" />
                    </div>
                    <div>
                      <label className={labelClasses}>Last Name <span className="text-gray-400">(optional)</span></label>
                      <input
                        name="lastName"
                        value={shipping.lastName}
                        onChange={(e) => handleChange(e, "shipping")}
                        onBlur={() => handleBlur("lastName", shipping.lastName, false)}
                        maxLength={50}
                        className={getInputClasses("lastName")}
                      />
                      <ErrorMessage field="lastName" />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className={labelClasses}>Street Address</label>
                    <input
                      name="address"
                      required
                      value={shipping.address}
                      onChange={(e) => handleChange(e, "shipping")}
                      onBlur={() => handleBlur("address", shipping.address)}
                      placeholder="House number and street name"
                      maxLength={200}
                      className={getInputClasses("address")}
                    />
                    <ErrorMessage field="address" />
                  </div>

                  <div className="mb-4">
                    <label className={labelClasses}>
                      Apartment, suite, etc. <span className="text-gray-400">(optional)</span>
                    </label>
                    <input
                      name="apartment"
                      value={shipping.apartment}
                      onChange={(e) => handleChange(e, "shipping")}
                      onBlur={() => handleBlur("apartment", shipping.apartment, false)}
                      maxLength={200}
                      className={getInputClasses("apartment")}
                    />
                    <ErrorMessage field="apartment" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className={labelClasses}>City</label>
                      <input
                        name="city"
                        required
                        value={shipping.city}
                        onChange={(e) => handleChange(e, "shipping")}
                        onBlur={() => handleBlur("city", shipping.city)}
                        maxLength={100}
                        className={getInputClasses("city")}
                      />
                      <ErrorMessage field="city" />
                    </div>
                    <div>
                      <label className={labelClasses}>State</label>
                      <select
                        name="state"
                        required
                        value={shipping.state}
                        onChange={(e) => handleChange(e, "shipping")}
                        onBlur={() => {
                          setTouched((prev) => ({ ...prev, state: true }));
                          setErrors((prev) => ({ ...prev, state: shipping.state ? "" : "Please select a state" }));
                        }}
                        className={getInputClasses("state")}
                      >
                        <option value="">Select State</option>
                        {states.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                      <ErrorMessage field="state" />
                    </div>
                    <div>
                      <label className={labelClasses}>PIN Code</label>
                      <input
                        name="pincode"
                        autoComplete="postal-code"
                        required
                        ref={pincodeRef}
                        value={shipping.pincode}
                        maxLength={6}
                        onBlur={() => {
                          handleBlur("pincode", shipping.pincode);
                          if (shipping.pincode.length === 6 && !errors.pincode) {
                            calculateShipping(shipping.pincode);
                          }
                        }}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, "");
                          setShipping({ ...shipping, pincode: value });
                        }}
                        placeholder="6-digit PIN"
                        className={getInputClasses("pincode")}
                      />
                      <ErrorMessage field="pincode" />
                    </div>
                  </div>

                  <div>
                    <label className={labelClasses}>Phone Number</label>
                    <input
                      name="phone"
                      required
                      type="tel"
                      value={shipping.phone}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        setShipping({ ...shipping, phone: value });
                      }}
                      onBlur={() => handleBlur("phone", shipping.phone)}
                      placeholder="10-digit phone number"
                      maxLength={15}
                      className={getInputClasses("phone")}
                    />
                    <ErrorMessage field="phone" />
                  </div>

                  {estimating && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Calculating shipping options...
                    </div>
                  )}
                </div>

                {/* Shipping Options */}
                {shippingOptions.length > 0 && (
                  <div className="bg-white rounded-xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <span className="w-6 h-6 bg-[#3d3c30] text-white rounded-full flex items-center justify-center text-sm">3</span>
                      Shipping Method
                    </h2>
                    <div className="space-y-3">
                      {shippingOptions.map((c) => (
                        <label
                          key={c.id}
                          className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            selectedCourier?.id === c.id
                              ? "border-[#3d3c30] bg-[#f5f5f0]"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="courier"
                              value={c.id}
                              checked={selectedCourier?.id === c.id}
                              onChange={() => {
                                setSelectedCourier(c);
                                setShippingCharge(c.rate);
                              }}
                              className="w-4 h-4 text-[#3d3c30] focus:ring-[#3d3c30]"
                            />
                            <div>
                              <p className="font-medium text-gray-800">{c.name}</p>
                              <p className="text-sm text-gray-500">
                                {c.etd || "Estimated delivery time varies"}
                              </p>
                            </div>
                          </div>
                          <span className="font-semibold text-gray-800">₹{c.rate}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Billing Section */}
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 bg-[#3d3c30] text-white rounded-full flex items-center justify-center text-sm">
                      {shippingOptions.length > 0 ? "4" : "3"}
                    </span>
                    Billing Address
                  </h2>

                  <label className="flex items-center gap-3 cursor-pointer mb-4">
                    <input
                      type="checkbox"
                      checked={sameAsShipping}
                      onChange={() => setSameAsShipping(!sameAsShipping)}
                      className="w-5 h-5 rounded border-gray-300 text-[#3d3c30] focus:ring-[#3d3c30]"
                    />
                    <span className="text-gray-700">Same as shipping address</span>
                  </label>

                  {!sameAsShipping && (
                    <div className="pt-4 border-t border-gray-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className={labelClasses}>First Name</label>
                          <input
                            name="firstName"
                            required
                            value={billing.firstName}
                            onChange={(e) => handleChange(e, "billing")}
                            onBlur={() => handleBlur("billingFirstName", billing.firstName)}
                            maxLength={50}
                            className={getInputClasses("billingFirstName")}
                          />
                          <ErrorMessage field="billingFirstName" />
                        </div>
                        <div>
                          <label className={labelClasses}>Last Name <span className="text-gray-400">(optional)</span></label>
                          <input
                            name="lastName"
                            value={billing.lastName}
                            onChange={(e) => handleChange(e, "billing")}
                            onBlur={() => handleBlur("billingLastName", billing.lastName, false)}
                            maxLength={50}
                            className={getInputClasses("billingLastName")}
                          />
                          <ErrorMessage field="billingLastName" />
                        </div>
                      </div>

                      <div className="mb-4">
                        <label className={labelClasses}>Street Address</label>
                        <input
                          name="address"
                          required
                          value={billing.address}
                          onChange={(e) => handleChange(e, "billing")}
                          onBlur={() => handleBlur("billingAddress", billing.address)}
                          maxLength={200}
                          className={getInputClasses("billingAddress")}
                        />
                        <ErrorMessage field="billingAddress" />
                      </div>

                      <div className="mb-4">
                        <label className={labelClasses}>
                          Apartment, suite, etc. <span className="text-gray-400">(optional)</span>
                        </label>
                        <input
                          name="apartment"
                          value={billing.apartment}
                          onChange={(e) => handleChange(e, "billing")}
                          onBlur={() => handleBlur("billingApartment", billing.apartment, false)}
                          maxLength={200}
                          className={getInputClasses("billingApartment")}
                        />
                        <ErrorMessage field="billingApartment" />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <div>
                          <label className={labelClasses}>City</label>
                          <input
                            name="city"
                            required
                            value={billing.city}
                            onChange={(e) => handleChange(e, "billing")}
                            onBlur={() => handleBlur("billingCity", billing.city)}
                            maxLength={100}
                            className={getInputClasses("billingCity")}
                          />
                          <ErrorMessage field="billingCity" />
                        </div>
                        <div>
                          <label className={labelClasses}>State</label>
                          <select
                            name="state"
                            required
                            value={billing.state}
                            onChange={(e) => handleChange(e, "billing")}
                            onBlur={() => {
                              setTouched((prev) => ({ ...prev, billingState: true }));
                              setErrors((prev) => ({ ...prev, billingState: billing.state ? "" : "Please select a state" }));
                            }}
                            className={getInputClasses("billingState")}
                          >
                            <option value="">Select State</option>
                            {states.map((state) => (
                              <option key={state} value={state}>
                                {state}
                              </option>
                            ))}
                          </select>
                          <ErrorMessage field="billingState" />
                        </div>
                        <div>
                          <label className={labelClasses}>PIN Code</label>
                          <input
                            name="pincode"
                            required
                            value={billing.pincode}
                            maxLength={6}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, "");
                              setBilling({ ...billing, pincode: value });
                            }}
                            onBlur={() => handleBlur("billingPincode", billing.pincode)}
                            className={getInputClasses("billingPincode")}
                          />
                          <ErrorMessage field="billingPincode" />
                        </div>
                      </div>

                      <div>
                        <label className={labelClasses}>Phone Number</label>
                        <input
                          name="phone"
                          required
                          type="tel"
                          value={billing.phone}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, "");
                            setBilling({ ...billing, phone: value });
                          }}
                          onBlur={() => handleBlur("billingPhone", billing.phone)}
                          placeholder="10-digit phone number"
                          maxLength={15}
                          className={getInputClasses("billingPhone")}
                        />
                        <ErrorMessage field="billingPhone" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Mobile Order Summary */}
                <div className="lg:hidden">
                  <OrderSummary
                    items={items}
                    subtotal={subtotal}
                    shippingCharge={shippingCharge}
                    total={total}
                    selectedCourier={selectedCourier}
                    shippingCalculated={shippingCalculated}
                    estimating={estimating}
                    placingOrder={placingOrder}
                    clearCart={clearCart}
                  />
                </div>
              </form>
            </div>

            {/* Desktop Order Summary Sidebar */}
            <div className="hidden lg:block">
              <div className="sticky top-8">
                <OrderSummary
                  items={items}
                  subtotal={subtotal}
                  shippingCharge={shippingCharge}
                  total={total}
                  selectedCourier={selectedCourier}
                  shippingCalculated={shippingCalculated}
                  estimating={estimating}
                  placingOrder={placingOrder}
                  clearCart={clearCart}
                  isDesktop
                  formRef={formRef}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface OrderSummaryProps {
  items: any[];
  subtotal: number;
  shippingCharge: number | null;
  total: number;
  selectedCourier: any;
  shippingCalculated: boolean;
  estimating: boolean;
  placingOrder: boolean;
  clearCart: () => void;
  isDesktop?: boolean;
  formRef?: React.RefObject<HTMLFormElement | null>;
}

function OrderSummary({
  items,
  subtotal,
  shippingCharge,
  total,
  selectedCourier,
  shippingCalculated,
  estimating,
  placingOrder,
  clearCart,
  isDesktop,
  formRef,
}: OrderSummaryProps) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Order Summary</h2>

      {/* Items */}
      <div className="space-y-4 mb-4">
        {items.map((item) => (
          <div key={item.id} className="flex gap-4">
            <div className="relative w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
              {item.image ? (
                <Image src={item.image} alt={item.name} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#3d3c30] text-white text-xs rounded-full flex items-center justify-center">
                {item.quantity}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{item.name}</p>
              <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
            </div>
            <p className="font-medium text-gray-800">₹{item.price * item.quantity}</p>
          </div>
        ))}
      </div>

      <hr className="border-gray-200 my-4" />

      {/* Totals */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Subtotal</span>
          <span>₹{subtotal}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Shipping</span>
          {shippingCharge !== null ? (
            <span>₹{shippingCharge}</span>
          ) : (
            <span className="text-gray-400">Enter PIN code</span>
          )}
        </div>
      </div>

      <hr className="border-gray-200 my-4" />

      <div className="flex justify-between text-lg font-semibold text-gray-800">
        <span>Total</span>
        <span>₹{total}</span>
      </div>

      {selectedCourier?.etd && (
        <p className="text-xs text-gray-500 mt-2">
          Estimated delivery: {selectedCourier.etd}
        </p>
      )}

      {/* Actions */}
      <div className="mt-6 space-y-3">
        {isDesktop ? (
          <button
            type="button"
            disabled={!shippingCalculated || estimating || placingOrder}
            onClick={() => formRef?.current?.requestSubmit()}
            className={`w-full py-3.5 rounded-full font-semibold transition-all flex items-center justify-center gap-2 ${
              shippingCalculated && !placingOrder
                ? "bg-[#3d3c30] text-white hover:bg-[#4a493a]"
                : "bg-gray-200 text-gray-500 cursor-not-allowed"
            }`}
          >
            {placingOrder ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Place Order
              </>
            )}
          </button>
        ) : (
          <button
            type="submit"
            disabled={!shippingCalculated || estimating || placingOrder}
            className={`w-full py-3.5 rounded-full font-semibold transition-all flex items-center justify-center gap-2 ${
              shippingCalculated && !placingOrder
                ? "bg-[#3d3c30] text-white hover:bg-[#4a493a]"
                : "bg-gray-200 text-gray-500 cursor-not-allowed"
            }`}
          >
            {placingOrder ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Place Order
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={clearCart}
          className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Clear Cart
        </button>
      </div>

      {/* Trust Badges */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Secure Payment
          </div>
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Safe Checkout
          </div>
        </div>
      </div>
    </div>
  );
}
