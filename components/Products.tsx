"use client";
import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client';
import { toast, ToastContainer } from 'react-toastify';
import { useCartStore } from '@/utils/store/cartStore';

interface Product{
    id :string,
    name :string,
    price : number,
    stock : number,
    image_url : string
}

const SellProducts = () => {

    const addToCart = useCartStore((state) => state.addToCart);

    const [products,setProducts] = useState<Product[]>([]);

    useEffect(() => {
        const fetchProducts = async ()=>{
            const supabase = createClient();
            const  {data  , error : err} = await supabase.from('products').select('*');
            if(err){
                console.log(err);
                toast.error("An error occurred");
                return;
            }
            console.log(data);
            console.log(err);
            setProducts(data || []);
        } ;

       fetchProducts();
    },[]);

  return (
    <div>
        <section className="py-24 px-8 lg:px-24 bg-[#f5f5f0]">
            <ToastContainer/>
  <div className="max-w-6xl mx-auto flex flex-col gap-20">
    {products !== null && products.map((product, i) => (
      <div
        key={product.id}
        className="bg-gradient-to-br from-white to-[#fafafa] rounded-3xl shadow-lg overflow-hidden p-12 flex flex-col md:flex-row items-center gap-12 hover:shadow-2xl transition duration-500"
      >
        {/* Left: Info */}
        <div className="flex-1 text-center md:text-left">
          <h2 className="text-4xl font-extrabold mb-4 tracking-wide text-[#2e2d25]">
            {product.name}
          </h2>
          <p className="text-lg md:text-xl font-light text-gray-700 mb-6 leading-relaxed">
            {product.name}
          </p>
          <p className="text-2xl font-semibold bg-gradient-to-r from-green-600 to-lime-500 bg-clip-text text-transparent mb-8">
            {product.price}
          </p>
          <Link
            href={`/products/${product.id}`}
            className="inline-block bg-[#3d3c30] text-[#e0dbb5] px-8 py-3 rounded-full font-medium shadow-md hover:bg-[#2f2e25] hover:shadow-lg transition duration-300 ease-in-out"
          >
            Learn More
          </Link>

           <button
        onClick={() =>
          addToCart({ ...product, quantity: 1 })
        }
        className="bg-[#4f4d3e] hover:bg-[#6a684d] px-4 py-2 rounded-lg mt-3 transition"
      >
        Add to Cart
      </button>

          

        </div>

        {/* Right: Product Image */}
        <div className="flex-1 relative h-72 md:h-80 w-full rounded-2xl overflow-hidden shadow-md hover:scale-[1.02] transition-transform duration-500">
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-cover"
          />
        </div>
      </div>
    ))}
  </div>
</section>

    </div>
  )
}

export default SellProducts