"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Footer from './Footer';
import Header from './Header';
import StarRating from './StarRating';
import ProductReviews from './ProductReviews';
import { useCartStore } from '@/utils/store/cartStore';

interface ReviewData {
  id: string;
  rating: number;
  review_text: string | null;
  helpful_count: number;
  created_at: string;
}

interface ProductSpecifications {
  npkNitrogen?: number | null;
  npkPhosphorus?: number | null;
  npkPotassium?: number | null;
  organicMatter?: number | null;
  moistureContent?: number | null;
  phValue?: number | null;
  cnRatio?: number | null;
  testCertificateNumber?: string | null;
  testCertificateDate?: string | null;
  testingLaboratory?: string | null;
  manufacturingLicense?: string | null;
  shelfLifeMonths?: number | null;
  batchLotNumber?: string | null;
  bestBeforeDate?: string | null;
}

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
  avgRating?: number | null;
  reviewCount?: number;
  initialReviews?: ReviewData[];
  initialReviewTotal?: number;
  ratingDistribution?: number[];
  specifications?: ProductSpecifications;
};

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <span className="text-gray-600 w-40 flex-shrink-0">{label}:</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  );
}

function SpecificationsSection({ specs }: { specs: ProductSpecifications }) {
  const hasNPK = specs.npkNitrogen != null || specs.npkPhosphorus != null || specs.npkPotassium != null;
  const hasComposition = specs.organicMatter != null || specs.moistureContent != null || specs.phValue != null || specs.cnRatio != null;
  const hasCertification = specs.testCertificateNumber || specs.testingLaboratory || specs.manufacturingLicense;
  const hasShelfInfo = specs.shelfLifeMonths != null || specs.batchLotNumber || specs.bestBeforeDate;

  if (!hasNPK && !hasComposition && !hasCertification && !hasShelfInfo) return null;

  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">Technical Specifications</h3>
      <div className="bg-gray-50 rounded-lg p-4 space-y-4 text-sm">

        {/* NPK Content */}
        {hasNPK && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">NPK Content</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Nitrogen (N)', value: specs.npkNitrogen },
                { label: 'Phosphorus (P)', value: specs.npkPhosphorus },
                { label: 'Potassium (K)', value: specs.npkPotassium },
              ].map((item) => (
                <div key={item.label} className="bg-white rounded-md p-2 border border-gray-200">
                  <p className="text-gray-500 text-xs">{item.label}</p>
                  <p className="text-green-700 font-semibold text-lg">
                    {item.value != null ? `${item.value}%` : '—'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Composition */}
        {hasComposition && (
          <div className="space-y-2">
            {specs.organicMatter != null && <SpecRow label="Organic Matter" value={`${specs.organicMatter}%`} />}
            {specs.moistureContent != null && <SpecRow label="Moisture Content" value={`${specs.moistureContent}%`} />}
            {specs.phValue != null && <SpecRow label="pH Value" value={String(specs.phValue)} />}
            {specs.cnRatio != null && <SpecRow label="C:N Ratio" value={`${specs.cnRatio}:1`} />}
          </div>
        )}

        {/* Certification */}
        {hasCertification && (
          <div className="space-y-2 border-t border-gray-200 pt-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Certification</p>
            {specs.testCertificateNumber && (
              <SpecRow
                label="Certificate No."
                value={`${specs.testCertificateNumber}${specs.testCertificateDate ? ` (${specs.testCertificateDate})` : ''}`}
              />
            )}
            {specs.testingLaboratory && <SpecRow label="Testing Lab" value={specs.testingLaboratory} />}
            {specs.manufacturingLicense && <SpecRow label="Mfg. License" value={specs.manufacturingLicense} />}
          </div>
        )}

        {/* Shelf Life & Batch */}
        {hasShelfInfo && (
          <div className="space-y-2 border-t border-gray-200 pt-3">
            {specs.shelfLifeMonths != null && <SpecRow label="Shelf Life" value={`${specs.shelfLifeMonths} months`} />}
            {specs.batchLotNumber && <SpecRow label="Batch/Lot No." value={specs.batchLotNumber} />}
            {specs.bestBeforeDate && <SpecRow label="Best Before" value={specs.bestBeforeDate} />}
          </div>
        )}
      </div>
    </div>
  );
}

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

          {/* Rating summary - clickable to scroll to reviews */}
          {product.reviewCount > 0 ? (
            <a href="#reviews" className="flex items-center gap-2 hover:opacity-80 transition-opacity w-fit">
              <StarRating rating={product.avgRating || 0} size="sm" showCount count={product.reviewCount} />
            </a>
          ) : (
            <a href="#reviews" className="text-sm text-gray-400 hover:text-gray-600 transition-colors w-fit">
              No ratings yet — be the first to review!
            </a>
          )}

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

          {/* Technical Specifications */}
          {product.specifications && (
            <SpecificationsSection specs={product.specifications} />
          )}

        </div>
      </section>

      {/* Reviews Section */}
      <section className="px-6 pb-8 max-w-6xl mx-auto">
        <ProductReviews
          productId={product.id}
          initialReviews={product.initialReviews || []}
          initialTotal={product.initialReviewTotal || 0}
          avgRating={product.avgRating || null}
          reviewCount={product.reviewCount || 0}
          ratingDistribution={product.ratingDistribution || [0, 0, 0, 0, 0]}
        />
      </section>

      {/* Footer */}
      <Footer/>
    </div>
  );
}
