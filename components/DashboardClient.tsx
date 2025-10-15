"use client";
import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Product = {
  id: number;
  name: string;
  stock: number;
  price: number;
  image_url: string;
};

const DashboardClient = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [editStock, setEditStock] = useState<number>(0);
  const [editPrice, setEditPrice] = useState<number>(0);

  useEffect(() => {
    fetch("/api/seller/products")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.products)) {
          setProducts(data.products);
        } else {
          console.error("Unexpected data format:", data);
          setProducts([]);
        }
      })
      .catch(() => setProducts([]));
  }, []);


  const handleEdit = (product: Product) => {
    window.location.href = "/edit-product/"+product.id;
  };


  return (
    <div className="p-8 bg-[#f5f5f0] min-h-screen">
      <div className="flex w-full justify-end items-center mb-6">
        <button
          className="mb-6 px-4 py-2 bg-[#3d3c30] text-[#e0dbb5] rounded hover:bg-[#5a5948]"
          onClick={() => (window.location.href = "/add-product")}
        >
          Add New Product
        </button>
      </div>

      <h1 className="text-3xl font-bold mb-6 text-[#3d3c30]">
        Stock Management
      </h1>

      <div className="overflow-x-auto bg-white rounded-xl shadow">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#3d3c30] text-[#e0dbb5]">
              <th className="p-3 text-left">Product</th>
              <th className="p-3 text-left">Stock</th>
              <th className="p-3 text-left">Price</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="p-3">{p.name}</td>

                {/* Editable Stock */}
                <td className="p-3">
                  {editId === p.id ? (
                    <input
                      type="number"
                      className="border rounded px-2 py-1 w-20"
                      value={editStock}
                      onChange={(e) => setEditStock(Number(e.target.value))}
                    />
                  ) : (
                    p.stock
                  )}
                </td>

                {/* Editable Price */}
                <td className="p-3">
                  {editId === p.id ? (
                    <input
                      type="number"
                      className="border rounded px-2 py-1 w-24"
                      value={editPrice}
                      onChange={(e) => setEditPrice(Number(e.target.value))}
                    />
                  ) : (
                    <>₹{p.price}</>
                  )}
                </td>

                {/* Actions */}
                <td className="p-3 flex gap-3">
                  {editId === p.id ? (
                    <>
                      <button
                        className="px-3 py-1 bg-green-600 text-white rounded"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="px-3 py-1 bg-gray-400 text-white rounded"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      
                      <button
                        onClick={() => handleEdit(p)}
                        className="ml-4 text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DashboardClient;
