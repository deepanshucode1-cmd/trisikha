import React from 'react';
import Image from 'next/image';

const AboutBusiness = () => {
  return (
    <section className='bg-[#323025] py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-16'>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center max-w-7xl mx-auto">
        {/* Text Content */}
        <div className="text-[#e0dbb5] flex flex-col justify-center order-2 lg:order-1">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 text-center lg:text-left leading-tight">
            Driving a Sustainable Tomorrow
          </h2>
          <p className='text-base sm:text-lg lg:text-xl mb-6 sm:mb-8 text-center lg:text-left max-w-lg mx-auto lg:mx-0 leading-relaxed text-[#c5c0a0]'>
            Trishikhaorganics is dedicated to promoting sustainable agricultural practices through our high-quality organic manure products.
          </p>

          {/* Small Image - Hidden on mobile, shown on tablet+ */}
          <div className="hidden sm:flex justify-center lg:justify-start">
            <div className="relative w-56 h-40 sm:w-64 sm:h-48 md:w-72 md:h-52 overflow-hidden rounded-xl shadow-lg transition-transform duration-300 hover:scale-105 hover:shadow-xl">
              <Image
                src="/about_business1.jpg"
                alt="Farmer in field"
                fill
                className='object-cover'
              />
            </div>
          </div>
        </div>

        {/* Main Image */}
        <div className="order-1 lg:order-2">
          <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/3] overflow-hidden rounded-xl shadow-lg transition-transform duration-300 hover:scale-[1.02] hover:shadow-xl">
            <Image
              src="/about_business2.jpg"
              alt="Sustainable farm field"
              fill
              className='object-cover'
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutBusiness;