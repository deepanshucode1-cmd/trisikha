"use client";
import { createClient } from '@/utils/supabase/client';
import React, { useState } from 'react'
import AvatarUpload from './AvatarUpload';

const AddProduct = () => {

      const [name, setName] = useState("");
      const [price, setPrice] = useState("");
      const [stock, setStock] = useState("");
      const [image, setImage] = useState<File | null>(null);
      const [loading, setLoading] = useState(false);
      const [message, setMessage] = useState("");
      const [imageUrl, setImageUrl] = useState("");
    
      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !price || !stock || !imageUrl) {
          setMessage("Please fill all fields");
          return;
        }
    
        setLoading(true);
        setMessage("");
    
        try {
          // 1️⃣ Upload image to Supabase Storage
          const supabase =  createClient();
         
          // 2️⃣ Insert product record in your products table
          const { error: dbError } = await supabase.from("products").insert([
            {
              name,
              price: Number(price),
              stock: Number(stock),
              image_url: imageUrl,
            },
          ]);
    
          if (dbError) throw dbError;
    
          setMessage("✅ Product added successfully!");
          setName("");
          setPrice("");
          setStock("");
          setImage(null);
        } catch (err: any) {
          setMessage(`❌ ${err.message}`);
        } finally {
          setLoading(false);
        }
      };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f6f5ef] to-[#e8e6da]">
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
            <p className="text-sm text-gray-500 mt-2">Click to upload/change image</p>
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
    </div>
  )
}

export default AddProduct