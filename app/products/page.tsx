import Footer from '@/components/Footer';
import Header from '@/components/Header';
import SellProducts from '@/components/Products';
import { createClient } from '@/utils/supabase/server';
import Image from 'next/image';
import Link from 'next/link';

export default function Products() {

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#3d3c30]">
      {/* Header - Reusing from previous */}
      <Header/>

      {/* Main Content */}
      <main>
        {/* Hero Section - Elegant with overlay and centered text */}
        <section className="relative w-full h-[800px] flex items-center justify-center overflow-hidden">
          <Image
            src="/product_hero.jpg" // Placeholder: Elegant farm landscape
            alt="Sustainable agriculture"
            fill
            className="object-cover brightness-75"
          />
          <div className="absolute text-center text-white z-10">
            <h1 className="text-6xl md:text-7xl font-bold mb-4 tracking-tight">Our Products</h1>
            <p className="text-2xl max-w-2xl mx-auto font-light">
              Discover our high-quality organic manure products designed for sustainable agriculture.
            </p>
          </div>
        </section>

        <SellProducts/>


        {/* Benefits Section - Elegant icons or simple list */}
        <section className="py-24 px-8 lg:px-24 bg-gradient-to-r from-[#323025] to-[#3d3c30] text-[#e0dbb5] font-sans">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-5xl font-bold text-center mb-16 tracking-tight">
               Why Choose Us?
            </h2>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
      <div className="text-center p-8 rounded-2xl bg-[#3d3c30]/50 backdrop-blur-md">
        <h3 className="text-2xl font-semibold mb-4">100% Organic</h3>
        <p className="text-lg font-light">
          Pure, natural ingredients for healthier soil and crops.
        </p>
      </div>
      <div className="text-center p-8 rounded-2xl bg-[#3d3c30]/50 backdrop-blur-md">
        <h3 className="text-2xl font-semibold mb-4">Chemical-Free</h3>
        <p className="text-lg font-light">
          Safe for the environment and your family.
        </p>
      </div>
      <div className="text-center p-8 rounded-2xl bg-[#3d3c30]/50 backdrop-blur-md">
        <h3 className="text-2xl font-semibold mb-4">Sustainable</h3>
        <p className="text-lg font-light">
          Promoting long-term agricultural health.
        </p>
      </div>
    </div>
  </div>
</section>


        {/* Call to Action - Elegant and minimal */}
        <section className="py-24 text-center bg-[#f5f5f0] font-sans">
          <h2 className="text-5xl font-bold mb-6 tracking-tight">Elevate Your Farming</h2>
          <p className="text-2xl font-light mb-10 max-w-3xl mx-auto">Experience the difference with our premium organic solutions.</p>
          <Link
            href="/contact"
            className="inline-block bg-[#e0dbb5] text-[#3d3c30] px-10 py-4 rounded-full font-medium text-xl hover:bg-white transition duration-300 ease-in-out shadow-md"
          >
            Get Started
          </Link>
        </section>
      </main>
      {/* Footer - Reusing from previous */}
      <Footer/>
    </div>
  );
}