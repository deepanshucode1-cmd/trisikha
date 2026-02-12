"use client";

import React, { useEffect, useState } from "react";
import { useCartStore } from "@/utils/store/cartStore";
import Image from "next/image";
import Link from "next/link";
import { Product } from "./Products";
import StarRating from "./StarRating";
import { toast, ToastContainer } from "react-toastify";
import { ShoppingCart, Zap, ArrowRight, Leaf } from "lucide-react";

export default function Offerings() {
  const addToCart = useCartStore((state) => state.addToCart);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/products");

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to load products");
        }

        const data = await res.json();
        setProducts(data);
      } catch (err) {
        console.error(err);
        toast.error("An error occurred while loading products");
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const handleAddToCart = (product: Product) => {
    if (product.stock === 0) {
      toast.error("This product is out of stock!");
      return;
    }

    addToCart({ ...product, quantity: 1 });

    toast.success(`${product.name} added to cart!`, {
      position: "top-center",
      autoClose: 3000,
      theme: "colored",
      style: {
        background: "#10B981",
        color: "white",
        borderRadius: "8px",
      },
    });
  };

  return (
    <section className="bg-gradient-to-b from-[#3d3c30] to-[#4a493a] py-20 px-6 lg:px-16 relative overflow-hidden">
      <ToastContainer />

      {/* Background decorative elements */}
      <div className="absolute top-10 left-10 opacity-5">
        <Leaf className="w-40 h-40 text-[#e0dbb5]" />
      </div>
      <div className="absolute bottom-10 right-10 opacity-5">
        <Leaf className="w-32 h-32 text-[#e0dbb5] rotate-45" />
      </div>

      {/* Heading */}
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-12">
          <div>
            <span className="inline-flex items-center gap-2 text-[#bdb88c] text-sm font-medium mb-3">
              <Leaf className="w-4 h-4" />
              Premium Selection
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-[#e0dbb5] leading-tight">
              Our Products
            </h2>
            <p className="text-[#c5c0a0] mt-3 max-w-md">
              Discover our range of premium organic manure products for healthier crops.
            </p>
          </div>
          <Link
            href="/products"
            className="group mt-6 md:mt-0 inline-flex items-center gap-2 bg-[#e0dbb5] text-[#3d3c30] font-semibold px-6 py-3 rounded-full hover:bg-white transition-all duration-300 hover:shadow-lg"
          >
            Explore All
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Loader */}
        {loading && (
          <div className="flex flex-col justify-center items-center py-20 gap-4">
            <div className="relative">
              <div className="h-14 w-14 border-4 border-[#e0dbb5]/30 rounded-full" />
              <div className="absolute inset-0 h-14 w-14 border-4 border-[#e0dbb5] border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-[#c5c0a0] text-sm">Loading products...</p>
          </div>
        )}

        {/* Product Grid */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {products.map((product, index) => (
              <div
                key={product.id}
                className="group bg-white rounded-3xl shadow-xl overflow-hidden hover:-translate-y-2 transition-all duration-500 flex flex-col"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Image */}
                <div className="relative w-full h-64 md:h-72 overflow-hidden">
                  <Image
                    src={product.image_url}
                    alt={product.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  {/* Overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {/* Stock badge */}
                  {product.stock === 0 ? (
                    <div className="absolute top-4 right-4 bg-red-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Out of Stock
                    </div>
                  ) : product.stock < 10 ? (
                    <div className="absolute top-4 right-4 bg-amber-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Only {product.stock} left
                    </div>
                  ) : (
                    <div className="absolute top-4 right-4 bg-green-600 text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                      <Leaf className="w-3 h-3" />
                      In Stock
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-6 flex-grow">
                  <h3 className="text-xl font-bold text-gray-800 mb-1 group-hover:text-[#3d3c30] transition-colors">
                    {product.name}
                  </h3>
                  {product.review_count && product.review_count > 0 && (
                    <div className="mb-2">
                      <StarRating
                        rating={product.avg_rating || 0}
                        size="sm"
                        showCount
                        count={product.review_count}
                      />
                    </div>
                  )}
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-[#3d3c30]">
                      ₹{product.price}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 p-4 pt-0">
                  <Link
                    href={`/buy-now?productId=${product.id}`}
                    className="flex-1 flex items-center justify-center gap-2 bg-[#3d3c30] text-white py-3.5 rounded-xl text-center hover:bg-[#2d2c20] transition-all duration-300 font-medium"
                  >
                    <Zap className="w-4 h-4" />
                    Buy Now
                  </Link>
                  <button
                    onClick={() => handleAddToCart(product)}
                    disabled={product.stock === 0}
                    className="flex-1 flex items-center justify-center gap-2 bg-[#e0dbb5] text-[#3d3c30] py-3.5 rounded-xl hover:bg-[#d1cc9f] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-300 font-medium"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Add to Cart
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
