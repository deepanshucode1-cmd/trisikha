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
    <div className="p-4 sm:p-6 lg:p-8 bg-[#f5f5f0] min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#3d3c30]">
          Stock Management
        </h1>
        <button
          className="px-4 py-2 bg-[#3d3c30] text-[#e0dbb5] rounded-lg hover:bg-[#5a5948] transition-colors text-sm sm:text-base"
          onClick={() => (window.location.href = "/add-product")}
        >
          + Add New Product
        </button>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {products.map((p) => (
          <div key={p.id} className="bg-white rounded-xl shadow p-4">
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-semibold text-[#3d3c30] text-lg pr-2">{p.name}</h3>
              <button
                onClick={() => handleEdit(p)}
                className="px-3 py-1 bg-[#3d3c30] text-[#e0dbb5] rounded-lg text-sm hover:bg-[#5a5948] transition-colors"
              >
                Edit
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-gray-500 block mb-1">Stock</span>
                <span className="font-semibold text-lg">{p.stock}</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-gray-500 block mb-1">Price</span>
                <span className="font-semibold text-lg">₹{p.price}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto bg-white rounded-xl shadow">
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
                <td className="p-3 font-medium">{p.name}</td>
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
                <td className="p-3">
                  {editId === p.id ? (
                    <div className="flex gap-2">
                      <button className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
                        Save
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="px-3 py-1 bg-gray-400 text-white rounded hover:bg-gray-500 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleEdit(p)}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {products.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No products found</p>
          <p className="text-sm mt-2">Add your first product to get started</p>
        </div>
      )}
    </div>
  );
};

export default DashboardClient;
