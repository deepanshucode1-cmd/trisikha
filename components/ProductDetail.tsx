import Image from 'next/image';
import Link from 'next/link';
import Footer from './Footer';
import Header from './Header';

// Hardcoded product data based on the screenshot

type Product = {
  name: string;
  price: string;
  image: string;
};

export default function ProductDetail(product : Product) {
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
            <span className="text-2xl font-bold text-green-700">{product.price}</span>
          </div>

          <div className="mt-4">
            <p className="text-gray-600 text-2xl">
                Benefits
            </p>    

            <ul className="list-disc list-inside mt-2 text-gray-700">
                <li>Trisikha Gold Manure is completely natural and cultured organic fertilizer </li>
                <li>Meet advanced needs of soil and plants typically addressed by harmful chemical fertilizers</li>
                <li>Rich in NPK and in other nutrients</li>
                <li>Provides complete nutrients to plants and crops</li>
                <li>Improves soil health and fertility</li>
                <li>Increases the number and size of flowers and fruits</li>
                <li>Helps the plant bloom on time</li>
            </ul>
          </div>  

          
        </div>
      </section>

      {/* Footer - Simplified for this page */}
      <Footer/>
    </div>
  );
}