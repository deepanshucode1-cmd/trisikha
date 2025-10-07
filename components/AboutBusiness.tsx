import React from 'react';
import Image from 'next/image';

const AboutBusiness = () => {
  return (
    <section className='bg-[#323025] py-20 px-6 md:px-16 grid grid-cols-1 md:grid-cols-2 gap-8 items-end font-sans'>
      <div className="text-[#e0dbb5] flex flex-col justify-center">
        <h2 className="text-4xl md:text-5xl mb-6 text-center md:text-left">Our Commitment to Sustainability</h2>
        <p className='text-lg md:text-xl mb-8 md:mb-12 text-center md:text-left max-w-lg mx-auto md:mx-0'>
          Trishikhaorganics is dedicated to promoting sustainable agricultural practices through our high-quality organic manure products.
        </p>
        <div className="w-full flex justify-center md:justify-start">
          <div className="relative w-64 h-48 md:w-80 md:h-60 overflow-hidden rounded-xl shadow-lg transition-transform duration-300 hover:scale-105 hover:shadow-xl">
            <Image 
              src="/about_business1.jpg"
              alt="Farmer in field"
              fill
              className='object-cover'
            />
          </div>
        </div>
      </div>
      <div className="w-full flex justify-center md:justify-end">
        <div className="relative w-full h-64 md:h-128 overflow-hidden rounded-xl shadow-lg transition-transform duration-300 hover:scale-105 hover:shadow-xl">
          <Image 
            src="/about_business2.jpg"
            alt="Sustainable farm field"
            fill
            className='object-cover'
          />
        </div>
      </div>
    </section>
  );
};

export default AboutBusiness;