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
    
      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !price || !stock || !image) {
          setMessage("Please fill all fields");
          return;
        }
    
        setLoading(true);
        setMessage("");
    
        try {
          // 1️⃣ Upload image to Supabase Storage
          const fileExt = image.name.split(".").pop();
          const fileName = `${Date.now()}.${fileExt}`;
          const supabase =  createClient();
          const { data: imgData, error: imgError } = await supabase.storage
            .from("product-images")
            .upload(fileName, image);
    
          if (imgError) throw imgError;
    
          const imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${fileName}`;
    
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
    <div>
                <div className="max-w-lg mx-auto bg-white p-8 rounded-2xl shadow-md">
        <h1 className="text-2xl font-semibold mb-6 text-center">Add Product</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Product Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md"
          />
          <input
            type="number"
            placeholder="Price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md"
          />
          <input
            type="number"
            placeholder="Stock Quantity"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md"
          />
          <AvatarUpload setUrl={(url: string) => {
            // convert a blob URL to a File and set the image state
            
          }} />
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#3d3c30] text-[#e0dbb5] p-3 rounded-md hover:opacity-90"
          >
            {loading ? "Uploading..." : "Add Product"}
          </button>
        </form>

        {message && <p className="mt-4 text-center text-sm">{message}</p>}
      </div>

    </div>
  )
}

export default AddProduct