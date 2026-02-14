import Footer from '@/components/Footer';
import Header from '@/components/Header';
import Image from 'next/image';
import Link from 'next/link';

const products = [
  {
    id: "trishikha-gold-1kg",
    name: "Trishikha Gold - 1kg",
    price: "₹ 135.00",
    image: "/product1.jpeg",
    description: "Boost your garden's growth with nutrient rich formula.",
  },
  {
    id: "trishikha-gold-5kg",
    name: "Trishikha Gold - 5kg",
    price: "₹ 510.00",
    image: "/product22.png",
    description: "Boost your garden's growth with nutrient rich formula.",
  },
];

export default function Products() {
  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#3d3c30]">
      {/* Header - Reusing from previous */}
      <Header />

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
        <section className="py-24 px-8 lg:px-24 bg-[#f5f5f0]">
          <div className="max-w-6xl mx-auto flex flex-col gap-20">
            {products.map((product, i) => (
              <div
                key={product.id}
                className="bg-gradient-to-br from-white to-[#fafafa] rounded-3xl shadow-lg overflow-hidden p-8 md:p-12 flex flex-col-reverse md:flex-row items-center gap-10 hover:shadow-2xl transition duration-500"
              >
                {/* Left: Info */}
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-3xl md:text-4xl font-extrabold mb-4 tracking-wide text-[#2e2d25]">
                    {product.name}
                  </h2>
                  <p className="text-lg font-light text-gray-700 mb-6 leading-relaxed">
                    {product.description}
                  </p>
                  <p className="text-2xl font-semibold bg-gradient-to-r from-green-600 to-lime-500 bg-clip-text text-transparent mb-8">
                    {product.price}
                  </p>
                  <Link
                    href={`/products/${product.id}`}
                    className="inline-block bg-[#3d3c30] text-[#e0dbb5] px-8 py-3 rounded-full font-medium shadow-md hover:bg-[#2f2e25] transition duration-300"
                  >
                    Learn More
                  </Link>
                </div>

                {/* Right: Product Image */}
                {/* We add 'min-h-[300px]' to ensure the container exists on mobile */}
                <div className="flex-1 relative w-full h-64 md:h-80 min-h-[250px] rounded-2xl overflow-hidden shadow-md">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                    priority={i === 0} // Preloads the first image for better mobile speed
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

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
      <Footer />
    </div>
  );
}