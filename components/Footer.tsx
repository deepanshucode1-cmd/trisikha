import Image from 'next/image';
import Link from 'next/link';

const Footer = () => {
  return (
    <footer className="bg-[#3d3c30] text-[#e0dbb5] py-12 px-6 lg:px-16">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Company Info / Logo */}
        <div className="flex flex-col items-center md:items-start">
          <Image
            src="/trisikha-logo-img.png"
            alt="Trishikha Logo"
            width={150}
            height={50}
            className="object-contain mb-4"
          />
          <p className="text-sm text-center md:text-left">
            Dedicated to sustainable agriculture through high-quality organic manure.
          </p>

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

        {/* Quick Links */}
        <div className="flex flex-col items-center md:items-start">
          <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/" className="hover:text-white transition-colors duration-300">
                Home
              </Link>
            </li>
            <li>
              <Link href="/about" className="hover:text-white transition-colors duration-300">
                About Us
              </Link>
            </li>
            <li>
              <Link href="/products" className="hover:text-white transition-colors duration-300">
                Products
              </Link>
            </li>
          </ul>
        </div>

        {/* Contact Info */}
        <div className="flex flex-col items-center md:items-start">
          <h3 className="text-lg font-semibold mb-4">Contact Us</h3>
          <ul className="space-y-2 text-sm">
            <li>Email: trishikhaorganic@gmail.com</li>
            <li>Phone: +91 79847 79369</li>
            <li>Address: Plot No 27, Swagat Industrial Area Park Vill. Dhanot, Kadi Chatral Road, Ta. Kalol, Distt: Gandhi Nagar Gujarat</li>
          </ul>
        </div>
      </div>

      {/* Copyright */}
      <div className="mt-8 border-t border-[#e0dbb5]/30 pt-6 text-center text-sm">
        &copy; {new Date().getFullYear()} Trishikha Organics. All rights reserved.
      </div>

      
    </footer>
  );
};

export default Footer;