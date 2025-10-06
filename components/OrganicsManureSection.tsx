import Image from "next/image";
import { Leaf, Droplets, Sprout, Globe2 } from "lucide-react";

const OrganicManureSection = () => {
  return (
    <section className="bg-[#3d3c30] text-[#e0dbb5] py-24 px-8 lg:px-24">
      <div className="max-w-6xl mx-auto">
        {/* Intro Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-20">
          <div>
            <h2 className="text-5xl font-bold font-sans mb-6 tracking-tight">
              Organic Manure: <br /> Nourishing the Earth Naturally
            </h2>
            <p className="text-lg leading-relaxed mb-8">
              Organic manure is a natural fertilizer made from decomposed plant
              and animal materials. It enriches the soil with essential
              nutrients, boosts microbial life, and promotes sustainable farming
              — keeping both crops and nature healthy.
            </p>
            <a
              href="/about"
              className="inline-block bg-[#4f4d3e] hover:bg-[#6a684d] text-[#e0dbb5] px-6 py-3 rounded-full font-medium transition"
            >
              Learn More
            </a>
          </div>

          <div className="flex justify-center">
            <Image
              src="/organic-manure.jpg"
              alt="Organic Manure 1"
              width={500}
              height={400}
              className="rounded-2xl shadow-lg object-cover"
            />
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-center">
          <div className="bg-[#464433] rounded-2xl p-8 shadow-md hover:shadow-xl hover:scale-105 transition-transform">
            <Leaf className="mx-auto mb-4 w-10 h-10" />
            <h3 className="text-xl font-semibold mb-2">Improves Soil Fertility</h3>
            <p>Adds organic matter and nutrients to keep soil alive.</p>
          </div>

          <div className="bg-[#464433] rounded-2xl p-8 shadow-md hover:shadow-xl hover:scale-105 transition-transform">
            <Droplets className="mx-auto mb-4 w-10 h-10" />
            <h3 className="text-xl font-semibold mb-2">Retains Moisture</h3>
            <p>Improves soil structure and enhances water-holding capacity.</p>
          </div>

          <div className="bg-[#464433] rounded-2xl p-8 shadow-md hover:shadow-xl hover:scale-105 transition-transform">
            <Sprout className="mx-auto mb-4 w-10 h-10" />
            <h3 className="text-xl font-semibold mb-2">Boosts Microbial Life</h3>
            <p>Encourages beneficial soil organisms for healthy growth.</p>
          </div>

          <div className="bg-[#464433] rounded-2xl p-8 shadow-md hover:shadow-xl hover:scale-105 transition-transform">
            <Globe2 className="mx-auto mb-4 w-10 h-10" />
            <h3 className="text-xl font-semibold mb-2">Eco-Friendly</h3>
            <p>Supports sustainable, chemical-free agriculture.</p>
          </div>
        </div>

        {/* Closing Line */}
        <div className="text-center mt-20">
          <p className="text-2xl italic font-light tracking-wide">
            “Healthy Soil, Healthy Future.”
          </p>
        </div>
      </div>
    </section>
  );
};

export default OrganicManureSection;
