"use client";
import { createClient } from '@/utils/supabase/client';
import React, { useEffect, useState } from 'react'


type Product = {
  id: number
  name: string
  stock_quantity: number
  price: number | string
  [key: string]: any
}

const DashboardClient = () => {



  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetch('/api/seller/products')
      .then(res => res.json())
      .then((data: Product[]) => setProducts(data))
      .catch(() => setProducts([]));
  }, []);

  const updateStock = async (id: number, newStock: number) => {
    await fetch('/api/seller/update-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, stock: newStock }),
    });
    setProducts(prev => prev.map(p => p.id === id ? { ...p, stock_quantity: newStock } : p));
  };

  return (
    <div className="p-8 bg-[#f5f5f0] min-h-screen">

      <div className='flex w-full justify-end items-center mb-6'>
        <button className="mb-6 px-4 py-2 bg-[#3d3c30] text-[#e0dbb5] rounded hover:bg-[#5a5948]" onClick={() => window.location.href = '/add-product'}>
          Add New Product
        </button>
      </div>
      <h1 className="text-3xl font-bold mb-6 text-[#3d3c30]">Stock Management</h1>
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
                <td className="p-3">{p.stock_quantity}</td>
                <td className="p-3">₹{p.price}</td>
                <td className="p-3 flex gap-2">
                  <button onClick={() => updateStock(p.id, p.stock_quantity + 1)}>+1</button>
                  <button onClick={() => updateStock(p.id, Math.max(0, p.stock_quantity - 1))}>-1</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>


    </div>
  );
}

export default DashboardClient