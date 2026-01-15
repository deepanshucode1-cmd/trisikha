import Footer from '@/components/Footer';
import Header from '@/components/Header';
import Image from 'next/image';
import Link from 'next/link';
import { Leaf, Award, Lightbulb, ArrowRight, Users, Target, Heart } from 'lucide-react';

export default function AboutUs() {
  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#3d3c30]">
      <Header/>

      <main>
        {/* Hero Section */}
        <section className="relative w-full h-[600px] md:h-[700px] lg:h-[800px] flex items-center justify-center overflow-hidden">
          <Image
            src="/about_us.jpg"
            alt="Sustainable agriculture"
            fill
            className="object-cover scale-105 animate-slow-zoom"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60" />

          <div className="absolute text-center text-white z-10 px-6">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 mb-6 animate-fade-in-up">
              <Leaf className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium">Since 2022</span>
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 animate-fade-in-up animation-delay-100 leading-tight">
              About <span className="text-[#e0dbb5]">Trishikha</span> Organics
            </h1>
            <p className="text-lg md:text-xl max-w-3xl mx-auto animate-fade-in-up animation-delay-200 text-gray-200 leading-relaxed">
              Pioneering sustainable agriculture with premium organic manure solutions. Rooted in nature, committed to a greener future.
            </p>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce-gentle">
            <div className="w-6 h-10 border-2 border-white/40 rounded-full flex justify-center pt-2">
              <div className="w-1.5 h-3 bg-white/60 rounded-full" />
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="bg-[#3d3c30] py-12">
          <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { number: '3+', label: 'Years Experience' },
              { number: '5000+', label: 'Happy Farmers' },
              { number: '100%', label: 'Organic Products' },
              { number: '15+', label: 'States Covered' },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-[#e0dbb5] mb-1">{stat.number}</div>
                <div className="text-sm text-[#c5c0a0]">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Our Story Section */}
        <section className="py-20 px-6 lg:px-16 bg-[#f5f5f0]">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className="order-2 lg:order-1">
                <span className="inline-flex items-center gap-2 text-[#6a684d] text-sm font-medium mb-4">
                  <Heart className="w-4 h-4" />
                  Our Journey
                </span>
                <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                  Our <span className="text-[#6a684d]">Story</span>
                </h2>
                <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                  Founded in 2022, Trishikha Organics began as a small family farm dedicated to eco-friendly practices. Today, we&apos;re a leading provider of high-quality organic manure, helping farmers nationwide nurture their soil naturally.
                </p>
                <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                  Our journey is driven by a passion for sustainability, innovation, and community empowerment. We believe in giving back to the earth what we take from it.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex items-center gap-3 bg-white p-4 rounded-xl shadow-sm">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <Target className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <div className="font-semibold">Mission Driven</div>
                      <div className="text-sm text-gray-500">Sustainable farming</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-white p-4 rounded-xl shadow-sm">
                    <div className="w-12 h-12 bg-[#e0dbb5] rounded-full flex items-center justify-center">
                      <Users className="w-6 h-6 text-[#3d3c30]" />
                    </div>
                    <div>
                      <div className="font-semibold">Community First</div>
                      <div className="text-sm text-gray-500">Empowering farmers</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2 relative">
                <div className="relative rounded-3xl overflow-hidden shadow-2xl">
                  <Image
                    src="/our_story.webp"
                    alt="Founders in the field"
                    width={600}
                    height={500}
                    className="object-cover w-full h-[400px] md:h-[500px]"
                  />
                </div>
                {/* Decorative element */}
                <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-[#e0dbb5] rounded-2xl -z-10" />
                <div className="absolute -top-6 -right-6 w-16 h-16 bg-[#3d3c30] rounded-2xl -z-10" />
              </div>
            </div>
          </div>
        </section>

        {/* Mission & Values Section */}
        <section className="bg-gradient-to-br from-[#323025] via-[#3d3c30] to-[#4a493a] py-24 px-6 lg:px-16 text-[#e0dbb5] relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#e0dbb5]/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#e0dbb5]/5 rounded-full blur-3xl" />

          <div className="max-w-6xl mx-auto relative z-10">
            <div className="text-center mb-16">
              <span className="inline-flex items-center gap-2 text-[#bdb88c] text-sm font-medium mb-4">
                <Award className="w-4 h-4" />
                What We Stand For
              </span>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Our Mission & Values</h2>
              <p className="text-[#c5c0a0] max-w-2xl mx-auto">
                Guiding principles that drive everything we do
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: Leaf,
                  title: 'Sustainability',
                  description: 'Promoting eco-friendly farming to preserve the planet for future generations.',
                  color: 'bg-green-500/20',
                  iconColor: 'text-green-400'
                },
                {
                  icon: Award,
                  title: 'Quality',
                  description: 'Delivering premium, nutrient-rich organic products backed by rigorous testing.',
                  color: 'bg-amber-500/20',
                  iconColor: 'text-amber-400'
                },
                {
                  icon: Lightbulb,
                  title: 'Innovation',
                  description: 'Continuously improving our processes to meet evolving agricultural needs.',
                  color: 'bg-blue-500/20',
                  iconColor: 'text-blue-400'
                }
              ].map((value, index) => (
                <div
                  key={index}
                  className="group bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-all duration-500 hover:-translate-y-2"
                >
                  <div className={`w-16 h-16 ${value.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <value.icon className={`w-8 h-8 ${value.iconColor}`} />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{value.title}</h3>
                  <p className="text-[#c5c0a0] leading-relaxed">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="bg-[#f5f5f0] py-24 px-6 lg:px-16 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('/pattern.svg')] opacity-5" />

          <div className="max-w-4xl mx-auto text-center relative z-10">
            <span className="inline-flex items-center gap-2 text-[#6a684d] text-sm font-medium mb-4">
              <Leaf className="w-4 h-4" />
              Get Started Today
            </span>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-[#3d3c30]">
              Join Our <span className="text-[#6a684d]">Journey</span>
            </h2>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
              Discover how we can help you achieve sustainable farming success. Let&apos;s grow together.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/contact"
                className="group inline-flex items-center justify-center gap-2 bg-[#3d3c30] text-[#e0dbb5] font-semibold px-8 py-4 rounded-full hover:bg-[#2d2c20] transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                Get in Touch
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/products"
                className="inline-flex items-center justify-center gap-2 border-2 border-[#3d3c30] text-[#3d3c30] font-semibold px-8 py-4 rounded-full hover:bg-[#3d3c30] hover:text-[#e0dbb5] transition-all duration-300"
              >
                View Products
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer/>
    </div>
  );
}