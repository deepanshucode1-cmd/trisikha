import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Leaf, Sparkles } from 'lucide-react'

const Hero = () => {
  return (
    <section className='relative w-full h-[500px] sm:h-[600px] md:h-[700px] lg:h-[800px] overflow-hidden'>
      {/* Background Image with Overlay */}
      <Image
        src="/organic_manure.jpg"
        alt="Organic farming background"
        fill
        priority
        className='object-cover scale-105 animate-slow-zoom'
      />
      {/* Gradient overlay for better visual depth */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />

      {/* Floating decorative elements */}
      <div className="absolute top-20 right-10 sm:right-20 opacity-20">
        <Leaf className="w-16 h-16 sm:w-24 sm:h-24 text-[#e0dbb5] animate-float" />
      </div>
      <div className="absolute bottom-32 right-1/4 opacity-15 hidden md:block">
        <Sparkles className="w-12 h-12 text-[#e0dbb5] animate-pulse" />
      </div>

      {/* Content */}
      <div className="relative flex flex-col justify-center h-full px-4 sm:px-6 lg:px-16">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 mb-6 animate-fade-in-up">
            <Leaf className="w-4 h-4 text-green-400" />
            <span className="text-sm text-white/90 font-medium">100% Organic & Natural</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.1] drop-shadow-lg animate-fade-in-up animation-delay-100">
            Empower Your <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>
            <span className="text-[#e0dbb5]">Farming</span>
          </h1>
          <p className="mt-4 sm:mt-6 text-base sm:text-lg md:text-xl text-gray-100/90 max-w-xl lg:max-w-2xl leading-relaxed drop-shadow-md animate-fade-in-up animation-delay-200">
            Our all-natural formula is packed with organic goodness, enriching the soil and fostering a flourishing ecosystem for your beloved plants.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mt-8 animate-fade-in-up animation-delay-300">
            <Link
              href="/products"
              className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#e0dbb5] hover:bg-white text-[#3d3c30] font-semibold rounded-full transition-all duration-300 hover:scale-105 shadow-lg text-base"
            >
              Shop Now
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-transparent border-2 border-white/30 hover:border-white/60 hover:bg-white/10 text-white font-semibold rounded-full transition-all duration-300 backdrop-blur-sm text-base"
            >
              Learn More
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="flex items-center gap-6 mt-10 animate-fade-in-up animation-delay-400">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <Leaf className="w-5 h-5 text-green-400" />
              </div>
              <span className="text-sm text-white/80">Eco-Friendly</span>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-[#e0dbb5]/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[#e0dbb5]" />
              </div>
              <span className="text-sm text-white/80">Premium Quality</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gradient for smooth transition */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#3d3c30] to-transparent" />
    </section>
  )
}

export default Hero
