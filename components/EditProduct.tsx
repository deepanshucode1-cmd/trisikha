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
  const [hsn, setHsn] = useState("");
  const [sku, setSku] = useState("");
  const [length, setLength] = useState("");
  const [breadth, setBreadth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [description, setDescription] = useState("");
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
        setName(product.name || "");
        setPrice(product.price?.toString() || "");
        setStock(product.stock?.toString() || "");
        setImageUrl(product.image_url || "");
        setHsn(product.hsn || "");
        setSku(product.sku || "");
        setLength(product.length?.toString() || "");
        setBreadth(product.breadth?.toString() || "");
        setHeight(product.height?.toString() || "");
        setWeight(product.weight?.toString() || "");
        setDescription(product.description || "");
      }
    };

    fetchProduct();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !price || !stock || !imageUrl) {
      setMessage("⚠️ Please fill all required fields");
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
          hsn,
          sku,
          length: Number(length) || null,
          breadth: Number(breadth) || null,
          height: Number(height) || null,
          weight: Number(weight) || null,
          description,
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
            {/* Product Name */}
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

            {/* Price and Stock */}
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

            {/* SKU and HSN */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU
                </label>
                <input
                  type="text"
                  placeholder="Enter SKU"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="w-full p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-[#3d3c30] focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  HSN Code
                </label>
                <input
                  type="text"
                  placeholder="Enter HSN Code"
                  value={hsn}
                  onChange={(e) => setHsn(e.target.value)}
                  className="w-full p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-[#3d3c30] focus:outline-none transition"
                />
              </div>
            </div>

            {/* Dimensions */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Length (cm)
                </label>
                <input
                  type="number"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className="w-full p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-[#3d3c30]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Breadth (cm)
                </label>
                <input
                  type="number"
                  value={breadth}
                  onChange={(e) => setBreadth(e.target.value)}
                  className="w-full p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-[#3d3c30]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Height (cm)
                </label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="w-full p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-[#3d3c30]"
                />
              </div>
            </div>

            {/* Weight */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Weight (g)
              </label>
              <input
                type="number"
                placeholder="Enter weight"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-[#3d3c30]"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                placeholder="Enter product description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-[#3d3c30] h-24 resize-none"
              />
            </div>

            {/* Image Upload */}
            <div className="flex flex-col items-center mt-4">
              <AvatarUpload
                setUrl={(url: string) => setImageUrl(url)}
                initial_image_url={imageUrl}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#3d3c30] text-[#e0dbb5] rounded-md font-medium hover:bg-[#4b493e] transition disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </form>

          {/* Message */}
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
          <ProgressBar />
        </div>
      )}
    </div>
  );
};

export default EditProduct;
