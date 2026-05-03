/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  razorpayOrderId: string;
  name?: string;
  description?: string;
  prefill?: { email?: string; contact?: string };
  themeColor?: string;
  onSuccess: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void | Promise<void>;
  onFailure?: () => void;
  onDismiss?: () => void;
}

export function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay script"));
    document.body.appendChild(script);
  });
}

export function openRazorpayCheckout(options: RazorpayCheckoutOptions): void {
  if (typeof window === "undefined" || !(window as any).Razorpay) {
    throw new Error("Razorpay script not loaded");
  }

  const rzp = new (window as any).Razorpay({
    key: options.key,
    amount: options.amount,
    currency: options.currency,
    order_id: options.razorpayOrderId,
    name: options.name || "Trishikha Organics",
    description: options.description || "Order Payment",
    handler: options.onSuccess,
    prefill: options.prefill || {},
    modal: {
      ondismiss: options.onDismiss || (() => {}),
    },
    theme: { color: options.themeColor || "#3d3c30" },
  });

  if (options.onFailure) {
    rzp.on("payment.failed", options.onFailure);
  }

  rzp.open();
}
