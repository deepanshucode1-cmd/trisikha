"use client";
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { toast, ToastContainer } from 'react-toastify';
import { useCartStore } from '@/utils/store/cartStore';
import StarRating from './StarRating';

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  image_url: string;
  avg_rating?: number | null;
  review_count?: number;
}

const SellProducts = () => {
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
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      theme: "colored",
      style: {
        background: "#10B981",
        color: "white",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
      },
    });
  };

  return (
    <div>
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#f8f9fa] to-[#e9ecef]">
        <ToastContainer
          position="top-center"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="colored"
        />
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
              Discover Our Organic Essentials
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Premium, earth-friendly products grown with care for a healthier you and planet.
            </p>
          </div>

                {/* Loader */}
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="h-12 w-12 border-4 border-[#e0dbb5] border-t-transparent rounded-full animate-spin" />
        </div>
      )}


          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
            {products.map((product) => (
              <article
                key={product.id}
                className="group bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-xl transition-all duration-500 hover:-translate-y-2"
              >
                {/* Product Image */}
                <div className="relative h-64 overflow-hidden bg-gray-50">
                  <Image
                    src={product.image_url}
                    alt={product.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  {product.stock === 0 && (
                    <div className="absolute inset-0 bg-red-500 bg-opacity-50 flex items-center justify-center">
                      <span className="text-white text-lg font-semibold">Out of Stock</span>
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="p-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-1 line-clamp-2 group-hover:text-green-700 transition-colors">
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
                  <p className="text-sm text-gray-500 mb-4 line-clamp-3">
                    Premium organic {product.name.toLowerCase()}. Sustainably sourced and packed with natural goodness for vibrant health.
                  </p>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-2xl font-bold text-green-600">
                      ₹{product.price}
                    </span>
                    <span className="text-xs text-gray-400">
                      {product.stock} in stock
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Link
                      href={`/products/${product.id}`}
                      className="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white py-3 px-6 rounded-lg text-center font-medium shadow-md hover:from-green-700 hover:to-green-800 transition-all duration-300 text-sm"
                    >
                      Learn More
                    </Link>
                    <button
                      onClick={() => handleAddToCart(product)}
                      disabled={product.stock === 0}
                      className="flex-1 bg-gray-900 text-white py-3 px-6 rounded-lg font-medium shadow-md hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-300 text-sm"
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {!loading && products.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No products available at the moment. Check back soon!</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default SellProducts;