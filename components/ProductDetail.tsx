"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Footer from './Footer';
import Header from './Header';
import { useCartStore } from '@/utils/store/cartStore';

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  description?: string;
  weight?: number;
  stock?: number;
  sku?: string;
  hsn?: string;
  countryOfOrigin?: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  netQuantity?: string;
};

export default function ProductDetail(product: Product) {
  const router = useRouter();
  const { addToCart } = useCartStore();

  const handleAddToCart = () => {
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      image_url: product.image,
    });
  };

  const handleBuyNow = () => {
    router.push(`/buy-now?productId=${product.id}`);
  };

  const isOutOfStock = product.stock !== undefined && product.stock <= 0;

  return (
    <div className="min-h-screen bg-white text-gray-800">

      {/* Header */}
      <Header/>


      {/* Product Section */}
      <section className="px-6 py-8 max-w-6xl mx-auto flex flex-col md:flex-row gap-8">
        {/* Product Image */}
        <div className="md:w-1/2">
          <Image
            src={product.image}
            alt={product.name}
            width={500}
            height={500}
            className="rounded-lg object-cover"
          />
        </div>

        {/* Product Details */}
        <div className="md:w-1/2 flex flex-col gap-4">
          <h1 className="text-2xl font-bold">{product.name}</h1>

          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-green-700">Rs {product.price.toFixed(2)}</span>
            <span className="text-sm text-gray-500">(Incl. of all taxes)</span>
          </div>

          {/* Stock Status */}
          {isOutOfStock ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 w-fit">
              Out of Stock
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 w-fit">
              In Stock
            </span>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <button
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                isOutOfStock
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-white border-2 border-green-700 text-green-700 hover:bg-green-50'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Add to Cart
            </button>
            <button
              onClick={handleBuyNow}
              disabled={isOutOfStock}
              className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                isOutOfStock
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-green-700 text-white hover:bg-green-800'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Buy Now
            </button>
          </div>

          {/* Benefits Section */}
          <div className="mt-4">
            <p className="text-gray-600 text-xl font-semibold">
              Benefits
            </p>

            <ul className="list-disc list-inside mt-2 text-gray-700 space-y-1">
              <li>Trishikha Gold Manure is completely natural and cultured organic fertilizer</li>
              <li>Meet advanced needs of soil and plants typically addressed by harmful chemical fertilizers</li>
              <li>Rich in NPK and in other nutrients</li>
              <li>Provides complete nutrients to plants and crops</li>
              <li>Improves soil health and fertility</li>
              <li>Increases the number and size of flowers and fruits</li>
              <li>Helps the plant bloom on time</li>
            </ul>
          </div>

          {/* Legal Metrology Declaration */}
          <div className="mt-6 border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Product Information</h3>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
              {/* Country of Origin */}
              <div className="flex">
                <span className="text-gray-600 w-40 flex-shrink-0">Country of Origin:</span>
                <span className="text-gray-800 font-medium">{product.countryOfOrigin || 'India'}</span>
              </div>

              {/* Net Quantity */}
              <div className="flex">
                <span className="text-gray-600 w-40 flex-shrink-0">Net Quantity:</span>
                <span className="text-gray-800 font-medium">
                  {product.netQuantity || (product.weight ? `${product.weight} kg` : '1 Unit')}
                </span>
              </div>

              {/* MRP */}
              <div className="flex">
                <span className="text-gray-600 w-40 flex-shrink-0">MRP:</span>
                <span className="text-gray-800 font-medium">Rs {product.price.toFixed(2)} (Incl. of all taxes)</span>
              </div>

              {/* Manufacturer Details */}
              <div className="flex flex-col sm:flex-row">
                <span className="text-gray-600 w-40 flex-shrink-0">Manufacturer:</span>
                <div className="text-gray-800">
                  <p className="font-medium">{product.manufacturerName || 'Trishikha Organics'}</p>
                  <p className="text-gray-600 text-xs mt-1">
                    {product.manufacturerAddress || 'Plot No 27, Swagat Industrial Area Park, Vill. Dhanot, Kadi Chatral Road, Ta. Kalol, Gandhi Nagar, Gujarat - 382721'}
                  </p>
                </div>
              </div>

              {/* SKU (if available) */}
              {product.sku && (
                <div className="flex">
                  <span className="text-gray-600 w-40 flex-shrink-0">SKU:</span>
                  <span className="text-gray-800 font-medium">{product.sku}</span>
                </div>
              )}

              {/* HSN Code (if available) */}
              {product.hsn && (
                <div className="flex">
                  <span className="text-gray-600 w-40 flex-shrink-0">HSN Code:</span>
                  <span className="text-gray-800 font-medium">{product.hsn}</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* Footer */}
      <Footer/>
    </div>
  );
}
