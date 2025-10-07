import React from 'react'
import Image from 'next/image'

const Hero = () => {
  return (
    
     
           <section className='relative w-full h-[800px]'>
                        <Image 
                        src="/organic_manure.jpg"
                        alt="Trishikha Logo"
                        fill
                        className='object-cover'
                        />
      
              <div className="relative container lg:mx-16 lg:px-0 flex flex-col justify-center h-full">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-sans text-white leading-tight">
                Empower Your <br /> Farming
              </h1>
              <p className="mt-6 text-lg md:text-xl font-sans text-gray-200 max-w-2xl">
                Our all-natural formula is packed with organic goodness, enriching the soil and fostering a flourishing ecosystem for your beloved plants. Join the organic revolution and watch your garden bloom with vitality 
              </p>
      
              
            </div>
                        
          </section>
  )
}

export default Hero