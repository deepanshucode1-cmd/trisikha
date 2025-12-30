"use client";
import Link from "next/link";
import { useCartStore } from "@/utils/store/cartStore";
import Image from "next/image";
import { useEffect } from "react";
import Header from "../Header";

export default function CartPage() {
  const { items, removeFromCart, clearCart,updateQuantity } = useCartStore();

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#3d3c30] to-[#2f2e25] text-[#e0dbb5] px-6 py-16 lg:px-24">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-10 text-center tracking-wide drop-shadow-md">
          Your Cart
        </h1>

        {items.length === 0 ? (
          <p className="text-center text-lg opacity-80">Your cart is empty.</p>
        ) : (
          <>
            <div className="space-y-4">
              {items.map((item) => (
      <div key={item.id} className="flex justify-between items-center bg-[#464433]/60 hover:bg-[#54513f]/70 transition rounded-2xl p-5 shadow-md">
        <div className="flex items-center gap-5">
          <div className="relative w-20 h-20 overflow-hidden rounded-lg shadow-sm">
            <Image src={item.image_url} alt={item.name} fill className="object-cover" />
          </div>

          <div>
            <h3 className="text-lg font-semibold capitalize tracking-wide">{item.name}</h3>
            <p className="text-sm text-[#d8d3a6] mt-1">₹{item.price}</p>

            {/* Quantity editor */}
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                className="px-2.5 py-1 bg-[#6a684d] hover:bg-[#817f5f] rounded-md text-sm"
              >
                -
              </button>

              <span className="px-3 py-1 bg-[#54513f] rounded-md text-sm">
                {item.quantity}
              </span>

              <button
                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                className="px-2.5 py-1 bg-[#6a684d] hover:bg-[#817f5f] rounded-md text-sm"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={() => removeFromCart(item.id)}
          className="text-sm text-[#f3e9b5] hover:text-[#fff0a5] underline transition"
        >
          Remove
        </button>
      </div>
    ))}
            </div>

            <div className="mt-10 border-t border-[#e0dbb5]/20 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
              <h2 className="text-2xl font-semibold tracking-wide">
                Total: ₹{total}
              </h2>
              <div className="flex gap-4">
                <button
                  onClick={clearCart}
                  className="px-5 py-2.5 rounded-full border border-[#e0dbb5]/40 text-sm hover:bg-[#4f4d3e]/60 transition"
                >
                  Clear Cart
                </button>
                <Link
                  href="/checkout"
                  className="bg-[#6a684d] hover:bg-[#817f5f] px-6 py-3 rounded-full text-sm font-medium transition shadow-md"
                >
                  Proceed to Checkout
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
