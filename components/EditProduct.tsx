/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";
import { createClient } from "@/utils/supabase/client";
import React, { useEffect, useState } from "react";
import AvatarUpload from "./AvatarUpload";
import ProgressBar from "./ProgressBar";

type IdType = {
  id: string;
};

const EditProduct = ({ id }: IdType) => {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data: product, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();
      
      setLoading(false);

      if (error) {
        setMessage(`❌ ${error.message}`);
        return;
      }

      if (product) {
        setName(product.name);
        setPrice(product.price.toString());
        setStock(product.stock.toString());
        setImageUrl(product.image_url);
      }
    };

    fetchProduct();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price || !stock || !imageUrl) {
      setMessage("⚠️ Please fill all fields");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();

      const { error: dbError } = await supabase
        .from("products")
        .update({
          name,
          price: Number(price),
          stock: Number(stock),
          image_url: imageUrl,
        })
        .eq("id", id);

      if (dbError) throw dbError;

      setMessage("✅ Product updated successfully!");
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f6f5ef] to-[#e8e6da]">
      
      {!loading && ( 
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-lg border border-[#ece8d5]">

        
        <h1 className="text-3xl font-bold text-center mb-8 text-[#3d3c30]">
          Edit Product
        </h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product Name
            </label>
            <input
              type="text"
              placeholder="Enter product name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-[#3d3c30] focus:outline-none transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price (₹)
              </label>
              <input
                type="number"
                placeholder="Price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-[#3d3c30] focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stock
              </label>
              <input
                type="number"
                placeholder="Quantity"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-[#3d3c30] focus:outline-none transition"
              />
            </div>
          </div>

          <div className="flex flex-col items-center mt-4">
            <AvatarUpload
              setUrl={(url: string) => setImageUrl(url)}
              initial_image_url={imageUrl}
            />
           
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#3d3c30] text-[#e0dbb5] rounded-md font-medium hover:bg-[#4b493e] transition disabled:opacity-60"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </form>

        {message && (
          <p
            className={`mt-5 text-center text-sm ${
              message.startsWith("✅")
                ? "text-green-600"
                : message.startsWith("⚠️")
                ? "text-yellow-600"
                : "text-red-600"
            }`}
          >
            {message}
          </p>
        )}
        

      
      </div>
      )}
        {loading && (
          <div className="w-full h-full flex items-center justify-center">
          <ProgressBar/>
          </div>
        )}
        
    </div>
  );
};

export default EditProduct;
