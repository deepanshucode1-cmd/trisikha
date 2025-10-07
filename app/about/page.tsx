import Footer from '@/components/Footer';
import Header from '@/components/Header';
import Image from 'next/image';
import Link from 'next/link';

export default function AboutUs() {
  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#3d3c30]">
      {/* Header - Reusing from previous suggestions */}
      
      <Header/>

      {/* Main Content */}
      <main>
        {/* Hero Section */}

      <section className="relative w-full h-[800px] flex items-center justify-center overflow-hidden">
                <Image
                  src="/about_us.jpg" // Placeholder: Elegant farm landscape
                  alt="Sustainable agriculture"
                  fill
                  className="object-cover brightness-75"
                />
                <div className="absolute text-center text-white z-10">
                  <h1 className="text-5xl md:text-6xl font-bold mb-6">About Trishikha Organics</h1>
                  <p className="text-xl max-w-3xl mx-auto mb-8">
                    Pioneering sustainable agriculture with premium organic manure solutions. Rooted in nature, committed to a greener future.
                  </p>
                </div>
              </section>
      

        {/* Our Story Section */}
        <section className="py-16 px-6 lg:px-16 bg-[#f5f5f0]">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-6">Our Story</h2>
              <p className="text-lg mb-4">
                Founded in 2022, TrishikhaOrganics began as a small family farm dedicated to eco-friendly practices. Today, we&apos;re a leading provider of high-quality organic manure, helping farmers nationwide nurture their soil naturally.
              </p>
              <p className="text-lg">
                Our journey is driven by a passion for sustainability, innovation, and community empowerment.
              </p>
            </div>
            <Image
              src="/our_story.webp" // Placeholder: Replace with relevant image
              alt="Founders in the field"
              width={600}
              height={400}
              className="rounded-xl shadow-lg object-cover"
            />
          </div>
        </section>

        {/* Mission & Values Section */}
        <section className="bg-[#323025] py-16 px-6 lg:px-16 text-[#e0dbb5]">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold font-sans text-center mb-12">Our Mission & Values</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <h3 className="text-2xl font-semibold font-sans mb-4">Sustainability</h3>
                <p className="text-lg">
                  Promoting eco-friendly farming to preserve the planet for future generations.
                </p>
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-semibold font-sans mb-4">Quality</h3>
                <p className="text-lg">
                  Delivering premium, nutrient-rich organic products backed by rigorous testing.
                </p>
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-semibold font-sans mb-4">Innovation</h3>
                <p className="text-lg">
                  Continuously improving our processes to meet evolving agricultural needs.
                </p>
              </div>
            </div>
          </div>
        </section>


        {/* Call to Action */}
        <section className="bg-[#3d3c30] py-16 px-6 lg:px-16 text-center text-[#e0dbb5]">
          <h2 className="text-4xl font-bold mb-6">Join Our Journey</h2>
          <p className="text-xl mb-8">Discover how we can help you achieve sustainable farming success.</p>
          <Link
            href="/contact"
            className="inline-block bg-[#e0dbb5] text-[#3d3c30] font-semibold px-8 py-3 rounded-full hover:bg-white transition duration-300"
          >
            Get in Touch
          </Link>
        </section>
      </main>

      {/* Footer - Reusing from previous */}
      <Footer/>
    </div>
  );
}