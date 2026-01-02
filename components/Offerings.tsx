"use client";

import React, { useEffect, useState } from "react";
import { useCartStore } from "@/utils/store/cartStore";
import Image from "next/image";
import Link from "next/link";
import { Product } from "./Products";
import { toast, ToastContainer } from "react-toastify";

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
          throw new Error("Failed to fetch products");
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
    <section className="bg-gradient-to-b from-[#3d3c30] to-[#4a493a] py-20 px-6 lg:px-16">
      <ToastContainer />

      {/* Heading */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-16">
        <h2 className="text-4xl md:text-5xl font-sans text-[#e0dbb5]">
          Our Products
        </h2>
        <Link
          href="/products"
          className="mt-6 md:mt-0 inline-block bg-[#e0dbb5] text-[#3d3c30] font-semibold px-6 py-2 rounded-full hover:bg-[#f0eacd] transition"
        >
          Explore All
        </Link>
      </div>

      {/* Loader */}
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="h-12 w-12 border-4 border-[#e0dbb5] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Product Grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-6xl mx-auto">
          {products.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-2xl shadow-lg overflow-hidden hover:-translate-y-1 transition flex flex-col"
            >
              {/* Image */}
              <div className="relative w-full h-64 md:h-72">
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  className="object-cover"
                />
              </div>

              {/* Info */}
              <div className="p-6 flex-grow">
                <h3 className="text-xl font-sans text-gray-800 mb-3">
                  {product.name}
                </h3>
                <span className="text-lg font-bold text-[#3d3c30]">
                  ₹{product.price}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-3 m-4">
                <Link
                  href={`/buy-now?productId=${product.id}`}
                  className="flex-1 bg-green-600 text-white py-3 rounded-lg text-center hover:bg-green-700 transition"
                >
                  Buy Now
                </Link>
                <button
                  onClick={() => handleAddToCart(product)}
                  disabled={product.stock === 0}
                  className="flex-1 bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 disabled:bg-gray-400 transition"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
