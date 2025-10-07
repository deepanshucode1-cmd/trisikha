// app/contact/page.js (or pages/contact.js depending on your Next.js setup)

import Image from "next/image";
import Link from "next/link";

export default function Contact() {
  return (
    <section className="bg-gradient-to-b from-[#3d3c30] to-[#4a493a] min-h-screen py-20 px-6 lg:px-16 text-[#e0dbb5]">
      {/* Heading */}
      <div className="max-w-6xl mx-auto mb-16">
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-8">
          Contact Us
        </h1>
        <p className="text-lg text-center max-w-3xl mx-auto opacity-90">
          We would love to hear from you! Whether you have questions about our products, need support, or want to share feedback, feel free to reach out.
        </p>
      </div>

      {/* Contact Info and Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
        {/* Contact Information */}
        <div className="bg-[#4a493a] rounded-3xl shadow-xl p-8 flex flex-col justify-between">
          <h2 className="text-2xl font-semibold mb-6">Get in Touch</h2>
          
          <div className="space-y-6">
            {/* Address */}
            <div className="flex items-start">
              <div className="flex-shrink-0 w-10 h-10 bg-[#e0dbb5] text-[#3d3c30] rounded-full flex items-center justify-center mr-4">
                📍
              </div>
              <div>
                <h3 className="font-semibold">Address</h3>
                <p className="opacity-90">Plot No 27, Swagat Industrial Area Park Vill. Dhanot, Kadi Chatral Road, Ta. Kalol, Distt: Gandhi Nagar Gujarat</p>
              </div>
            </div>
            
            {/* Phone */}
            <div className="flex items-start">
              <div className="flex-shrink-0 w-10 h-10 bg-[#e0dbb5] text-[#3d3c30] rounded-full flex items-center justify-center mr-4">
                📞
              </div>
              <div>
                <h3 className="font-semibold">Phone</h3>
                <p className="opacity-90">+91 79847 79369</p>
              </div>
            </div>
            
            {/* Email */}
            <div className="flex items-start">
              <div className="flex-shrink-0 w-10 h-10 bg-[#e0dbb5] text-[#3d3c30] rounded-full flex items-center justify-center mr-4">
                ✉️
              </div>
              <div>
                <h3 className="font-semibold">Email</h3>
                <p className="opacity-90">trishikhaorganic@gmail.com</p>
              </div>
            </div>
          </div>

          {/* Social Links */}
          <div className="mt-8">
            <h3 className="font-semibold mb-4">Follow Us</h3>
            <div className="flex space-x-4">
              <Link href="https://www.instagram.com/trishikhagold/" className="hover:opacity-80 transition-opacity">
              <Image src="/insta.svg" alt="Facebook" width={24} height={24} />
              </Link>
              <Link href="https://www.facebook.com/profile.php?id=61558978299229" className="hover:opacity-80 transition-opacity">
              <Image src="/facebook.svg" alt="Facebook" width={24} height={24} />
                
              </Link>
            </div>
          </div>

          
        </div>

        {/* Contact Form */}
              </div>
    </section>
  );
}