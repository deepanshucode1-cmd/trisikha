"use client";
import Link from "next/link";
import { useCartStore } from "@/utils/store/cartStore";
import Image from "next/image";
import {
  ShoppingCart,
  Trash2,
  Minus,
  Plus,
  ArrowLeft,
  Leaf,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";

export default function CartPage() {
  const { items, removeFromCart, clearCart, updateQuantity } = useCartStore();

  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleRemove = (id: string, name: string) => {
    removeFromCart(id);
    toast.success(`${name} removed from cart`, {
      position: "top-center",
      autoClose: 2000,
      theme: "colored",
      style: {
        background: "#3d3c30",
        color: "#e0dbb5",
        borderRadius: "8px",
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#3d3c30] to-[#2f2e25] text-[#e0dbb5] px-6 py-16 lg:px-24 relative overflow-hidden">
      <ToastContainer />

      {/* Background decorative elements */}
      <div className="absolute top-10 left-10 opacity-5">
        <Leaf className="w-40 h-40 text-[#e0dbb5]" />
      </div>
      <div className="absolute bottom-10 right-10 opacity-5">
        <Leaf className="w-32 h-32 text-[#e0dbb5] rotate-45" />
      </div>

      <div className="max-w-3xl mx-auto relative">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 text-[#bdb88c] text-sm font-medium mb-3">
            <ShoppingCart className="w-4 h-4" />
            Your Shopping Cart
          </span>
          <h1 className="text-4xl md:text-5xl font-bold tracking-wide drop-shadow-md">
            Your Cart
          </h1>
          {items.length > 0 && (
            <p className="text-[#c5c0a0] mt-3">
              {totalItems} {totalItems === 1 ? "item" : "items"} in your cart
            </p>
          )}
        </div>

        {items.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 gap-6">
            <div className="w-24 h-24 rounded-full bg-[#464433]/60 flex items-center justify-center">
              <ShoppingCart className="w-12 h-12 text-[#c5c0a0]" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-2">
                Your cart is empty
              </h2>
              <p className="text-[#c5c0a0] max-w-sm">
                Looks like you haven&apos;t added any products yet. Browse our
                organic manure collection to get started.
              </p>
            </div>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 bg-[#e0dbb5] text-[#3d3c30] font-semibold px-6 py-3 rounded-full hover:bg-white transition-all duration-300 hover:shadow-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              Browse Products
            </Link>
          </div>
        ) : (
          <>
            {/* Cart Items */}
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#464433]/60 hover:bg-[#54513f]/70 transition-all duration-300 rounded-2xl p-5 shadow-md"
                >
                  <div className="flex items-center gap-5">
                    {/* Product Image */}
                    <div className="relative w-24 h-24 flex-shrink-0 overflow-hidden rounded-xl shadow-sm">
                      <Image
                        src={item.image_url}
                        alt={item.name}
                        fill
                        className="object-cover"
                      />
                    </div>

                    {/* Product Info */}
                    <div className="flex-grow min-w-0">
                      <h3 className="text-lg font-semibold capitalize tracking-wide truncate">
                        {item.name}
                      </h3>
                      <p className="text-sm text-[#c5c0a0] mt-1">
                        ₹{item.price} each
                      </p>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1 mt-3">
                        <button
                          onClick={() =>
                            updateQuantity(
                              item.id,
                              Math.max(1, item.quantity - 1)
                            )
                          }
                          className="w-8 h-8 flex items-center justify-center bg-[#6a684d] hover:bg-[#817f5f] rounded-lg transition-colors duration-200"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>

                        <span className="w-10 h-8 flex items-center justify-center bg-[#54513f] rounded-lg text-sm font-medium">
                          {item.quantity}
                        </span>

                        <button
                          onClick={() =>
                            updateQuantity(item.id, item.quantity + 1)
                          }
                          className="w-8 h-8 flex items-center justify-center bg-[#6a684d] hover:bg-[#817f5f] rounded-lg transition-colors duration-200"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Subtotal & Remove */}
                    <div className="flex flex-col items-end gap-3 flex-shrink-0">
                      <span className="text-xl font-bold">
                        ₹{item.price * item.quantity}
                      </span>
                      <button
                        onClick={() => handleRemove(item.id, item.name)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 transition-colors duration-200"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="mt-10 border-t border-[#e0dbb5]/15 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <Link
                  href="/products"
                  className="inline-flex items-center gap-2 text-sm text-[#c5c0a0] hover:text-[#e0dbb5] transition-colors duration-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Continue Shopping
                </Link>
                <button
                  onClick={clearCart}
                  className="px-5 py-2.5 rounded-full border border-[#e0dbb5]/30 text-sm hover:bg-[#4f4d3e]/60 transition-colors duration-200"
                >
                  Clear Cart
                </button>
              </div>
              <div className="flex items-center gap-4 w-full sm:w-auto">
                <span className="text-2xl font-bold">₹{total}</span>
                <Link
                  href="/checkout"
                  className="flex-1 sm:flex-none text-center bg-[#e0dbb5] text-[#3d3c30] font-semibold px-8 py-3.5 rounded-full hover:bg-white transition-all duration-300 hover:shadow-lg"
                >
                  Checkout
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
