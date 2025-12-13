"use client";

import { useRouter } from "next/navigation";

export default function DashboardNav() {
  const router = useRouter();

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col sm:flex-row gap-6 bg-white p-8 rounded-3xl shadow-xl border">
        <button
          onClick={() => router.push("/admin/products")}
          className="w-52 h-14 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 
                     text-white text-lg font-semibold shadow-md
                     hover:scale-105 hover:shadow-lg active:scale-95 transition-all duration-200"
        >
          Products
        </button>

        <button
          onClick={() => router.push("/admin/orders")}
          className="w-52 h-14 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 
                     text-white text-lg font-semibold shadow-md
                     hover:scale-105 hover:shadow-lg active:scale-95 transition-all duration-200"
        >
          Orders
        </button>
      </div>
    </div>
  );
}
