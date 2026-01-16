import Footer from '@/components/Footer';
import Header from '@/components/Header';
import SellProducts from '@/components/Products';
import Image from 'next/image';
import Link from 'next/link';
import { Leaf, Shield, Recycle, Truck, BadgeCheck, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function Products() {
  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#3d3c30]">
      <Header />

      <main>
        {/* Hero Section */}
        <section className="relative w-full h-[500px] md:h-[600px] lg:h-[700px] flex items-center justify-center overflow-hidden">
          <Image
            src="/product_hero.jpg"
            alt="Sustainable agriculture"
            fill
            className="object-cover scale-105 animate-slow-zoom"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />

          <div className="absolute text-center text-white z-10 px-6">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 mb-6 animate-fade-in-up">
              <Sparkles className="w-4 h-4 text-[#e0dbb5]" />
              <span className="text-sm font-medium">Premium Quality</span>
            </div>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold mb-6 tracking-tight animate-fade-in-up animation-delay-100">
              Our <span className="text-[#e0dbb5]">Products</span>
            </h1>
            <p className="text-lg md:text-xl max-w-2xl mx-auto font-light text-gray-200 animate-fade-in-up animation-delay-200">
              Discover our high-quality organic manure products designed for sustainable agriculture.
            </p>
            <div className="flex flex-wrap justify-center gap-4 mt-8 animate-fade-in-up animation-delay-300">
              <div className="flex items-center gap-2 text-sm text-white/80">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                100% Organic
              </div>
              <div className="flex items-center gap-2 text-sm text-white/80">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                Lab Tested
              </div>
            </div>
          </div>

          {/* Bottom gradient for smooth transition */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#f5f5f0] to-transparent" />
        </section>

        <SellProducts />

        {/* Benefits Section */}
        <section className="py-24 px-6 lg:px-16 bg-gradient-to-br from-[#323025] via-[#3d3c30] to-[#4a493a] text-[#e0dbb5] relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-20 left-20 opacity-5">
            <Leaf className="w-64 h-64" />
          </div>
          <div className="absolute bottom-20 right-20 opacity-5">
            <Leaf className="w-48 h-48 rotate-45" />
          </div>

          <div className="max-w-6xl mx-auto relative z-10">
            <div className="text-center mb-16">
              <span className="inline-flex items-center gap-2 text-[#bdb88c] text-sm font-medium mb-4">
                <BadgeCheck className="w-4 h-4" />
                Why Choose Us
              </span>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                The Trishikha <span className="text-[#bdb88c]">Advantage</span>
              </h2>
              <p className="text-[#c5c0a0] max-w-2xl mx-auto">
                We&apos;re committed to delivering the best organic products for your farming needs.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  icon: Leaf,
                  title: '100% Organic',
                  description: 'Pure, natural ingredients for healthier soil and crops. No synthetic additives.',
                  color: 'bg-green-500/20',
                  iconColor: 'text-green-400'
                },
                {
                  icon: Shield,
                  title: 'Chemical-Free',
                  description: 'Safe for the environment, your family, and the entire ecosystem.',
                  color: 'bg-blue-500/20',
                  iconColor: 'text-blue-400'
                },
                {
                  icon: Recycle,
                  title: 'Sustainable',
                  description: 'Promoting long-term agricultural health and soil regeneration.',
                  color: 'bg-emerald-500/20',
                  iconColor: 'text-emerald-400'
                },
                {
                  icon: BadgeCheck,
                  title: 'Lab Tested',
                  description: 'Every batch is rigorously tested for quality and nutrient content.',
                  color: 'bg-amber-500/20',
                  iconColor: 'text-amber-400'
                },
                {
                  icon: Truck,
                  title: 'Pan-India Delivery',
                  description: 'Fast and reliable shipping to all corners of the country.',
                  color: 'bg-purple-500/20',
                  iconColor: 'text-purple-400'
                },
                {
                  icon: Sparkles,
                  title: 'Premium Quality',
                  description: 'Carefully crafted products that deliver exceptional results.',
                  color: 'bg-rose-500/20',
                  iconColor: 'text-rose-400'
                }
              ].map((benefit, index) => (
                <div
                  key={index}
                  className="group bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-all duration-500 hover:-translate-y-2"
                >
                  <div className={`w-14 h-14 ${benefit.color} rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                    <benefit.icon className={`w-7 h-7 ${benefit.iconColor}`} />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{benefit.title}</h3>
                  <p className="text-[#c5c0a0] leading-relaxed text-sm">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Call to Action Section */}
        <section className="py-24 px-6 lg:px-16 bg-[#f5f5f0] relative overflow-hidden">
          <div className="max-w-4xl mx-auto">
            <div className="bg-gradient-to-br from-[#3d3c30] to-[#4a493a] rounded-3xl p-10 md:p-16 text-center relative overflow-hidden shadow-2xl">
              {/* Background decoration */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#e0dbb5]/10 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#e0dbb5]/10 rounded-full blur-3xl" />

              <div className="relative z-10">
                <span className="inline-flex items-center gap-2 text-[#bdb88c] text-sm font-medium mb-4">
                  <Leaf className="w-4 h-4" />
                  Get Started Today
                </span>
                <h2 className="text-4xl md:text-5xl font-bold text-[#e0dbb5] mb-6">
                  Elevate Your Farming
                </h2>
                <p className="text-xl text-[#c5c0a0] mb-10 max-w-2xl mx-auto">
                  Experience the difference with our premium organic solutions. Transform your soil, transform your harvest.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link
                    href="/contact"
                    className="group inline-flex items-center justify-center gap-2 bg-[#e0dbb5] text-[#3d3c30] px-8 py-4 rounded-full font-semibold text-lg hover:bg-white transition-all duration-300 shadow-lg hover:shadow-xl"
                  >
                    Contact Us
                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <a
                    href="tel:+919876543210"
                    className="inline-flex items-center justify-center gap-2 border-2 border-[#e0dbb5]/30 text-[#e0dbb5] px-8 py-4 rounded-full font-semibold text-lg hover:bg-[#e0dbb5]/10 transition-all duration-300"
                  >
                    Call Now
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}