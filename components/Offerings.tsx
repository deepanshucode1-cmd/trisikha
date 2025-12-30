"use client";
import React from "react";
import { useCartStore } from "@/utils/store/cartStore";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Product } from "./Products";
import { createClient } from "@/utils/supabase/client";
import { toast, ToastContainer } from "react-toastify";

export default function Offerings() {

  const addToCart = useCartStore((state) => state.addToCart);
  
    const [products, setProducts] = useState<Product[]>([]);
  
    useEffect(() => {
      const fetchProducts = async () => {
        const supabase = createClient();
        const { data, error: err } = await supabase.from('products').select('*');
        if (err) {
          console.log(err);
          toast.error("An error occurred");
          return;
        }
        setProducts(data || []);
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
    <section className="bg-gradient-to-b from-[#3d3c30] to-[#4a493a] py-20 px-6 lg:px-16">
      <ToastContainer/>
      {/* Heading */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-16">
        <h2 className="text-4xl md:text-5xl font-sans text-[#e0dbb5]">
          Our Products
        </h2>
        <Link
          href="/products"
          className="mt-6 md:mt-0 inline-block bg-[#e0dbb5] text-[#3d3c30] font-semibold px-6 py-2 rounded-full hover:bg-[#f0eacd] transition-all duration-300 shadow-md hover:shadow-lg"
        >
          Explore All
        </Link>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-6xl mx-auto">
        {products.map((product) => (
          <div
            key={product.id}
            className="bg-white rounded-2xl shadow-lg overflow-hidden transform transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl flex flex-col"
          >
            {/* Product Image */}
            <div className="relative w-full h-64 md:h-72">
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                className="object-cover"
              />
            </div>

            {/* Product Info */}
            <div className="p-6 flex flex-col justify-between flex-grow">
              <h3 className="text-xl font-sans text-gray-800 mb-3">
                {product.name}
              </h3>
              <span className="text-lg font-sans font-bold text-[#3d3c30]">
                {product.price}
              </span>
            </div>


                  <div className="flex flex-col sm:flex-row gap-3 m-4">
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
        ))}

        
      </div>
    </section>
  );
}
