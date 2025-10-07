import React from 'react'

const Test = () => {
  return (
    <section className="flex flex-col lg:flex-row items-end gap-8 px-8 py-12 bg-[#2a291f] text-[#e0dbb5]">
  {/* Left Content */}
  <div className="flex-1">
    <h2 className="text-4xl font-bold mb-4">Commitment to Sustainability</h2>
    <p className="text-base leading-relaxed">
      Founded in 2022, Trishikhaorganics specializes in organic manure production.
      We focus on raising awareness about our products while performing well in
      the local market, with ambitions for sales expansion.
    </p>
  </div>

  {/* Right Content (images) */}
  <div className="flex-1 flex items-end gap-6">
    <div className="w-1/2">
      <img
        src="/about_business1.jpg"
        alt="Founder"
        className="rounded-lg shadow-lg object-cover w-full h-64"
      />
    </div>
    <div className="w-1/2">
      <img
        src="/about_business2.jpg"
        alt="Gardening"
        className="rounded-lg shadow-lg object-cover w-full h-80"
      />
    </div>
  </div>
</section>

  )
}

export default Test