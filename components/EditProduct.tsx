"use client";
import { createClient } from '@/utils/supabase/client';
import React, { use, useEffect, useState } from 'react'
import AvatarUpload from './AvatarUpload';

type IdType = {
  id : string;
}

const EditProduct = ( idType  :  IdType) => {

      const [name, setName] = useState("");
      const [price, setPrice] = useState("");
      const [stock, setStock] = useState("");
      const [image, setImage] = useState<File | null>(null);
      const [loading, setLoading] = useState(false);
      const [message, setMessage] = useState("");
      const [imageUrl, setImageUrl] = useState("");
      
      useEffect(()=>{
        const fetchProduct = async ()=> {
        const supabase =  createClient();
        const { data : product, error: dbError } = await supabase.from("products").select("*").eq("id",idType.id).single();
        console.log("Product data: ",product);
        if(dbError){
          console.log("Error fetching product: ",dbError);
          setMessage(`❌ ${dbError.message}`);
          return;
        }
        if(product){
          setName(product.name);
          setPrice(product.price.toString());
          setStock(product.stock.toString());
          setImageUrl(product.image_url);
        }
      }

      fetchProduct();
      console.log("Fetching product with id: ",idType.id);
      },[]);
    
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
          const { error: dbError } = await supabase.from("products").update(
            {
              name,
              price: Number(price),
              stock: Number(stock),
              image_url: imageUrl,
            },
          ).eq("id",idType.id);
    
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
            setImageUrl(url);   
          }} initial_image_url={imageUrl} />
          
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

export default EditProduct;