import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

const Hero = () => {
  return (
    <section className='relative w-full h-[500px] sm:h-[600px] md:h-[700px] lg:h-[800px]'>
      {/* Background Image with Overlay */}
      <Image
        src="/organic_manure.jpg"
        alt="Organic farming background"
        fill
        priority
        className='object-cover'
      />
      {/* Dark overlay for better text readability on mobile */}
      <div className="absolute inset-0 bg-black/30 sm:bg-black/20" />

      {/* Content */}
      <div className="relative flex flex-col justify-center h-full px-4 sm:px-6 lg:px-16">
        <div className="max-w-3xl">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold text-white leading-tight drop-shadow-lg">
            Empower Your <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>Farming
          </h1>
          <p className="mt-4 sm:mt-6 text-sm sm:text-base md:text-lg lg:text-xl text-gray-100 max-w-xl lg:max-w-2xl leading-relaxed drop-shadow-md">
            Our all-natural formula is packed with organic goodness, enriching the soil and fostering a flourishing ecosystem for your beloved plants.
          </p>

          {/* CTA Button */}
          <Link
            href="/products"
            className="inline-block mt-6 sm:mt-8 px-6 sm:px-8 py-3 sm:py-4 bg-[#4a493a] hover:bg-[#5a594a] text-white font-semibold rounded-full transition-all duration-300 hover:scale-105 shadow-lg text-sm sm:text-base"
          >
            Shop Now
          </Link>
        </div>
      </div>
    </section>
  )
}

export default Hero
