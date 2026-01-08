import Image from 'next/image';
import Link from 'next/link';

const Footer = () => {
  return (
    <footer className="bg-[#3d3c30] text-[#e0dbb5] py-10 sm:py-12 px-4 sm:px-6 lg:px-16">
      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
        {/* Company Info / Logo */}
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
          <Image
            src="/trisikha-logo-img.png"
            alt="Trishikha Logo"
            width={130}
            height={45}
            className="object-contain mb-4"
          />
          <p className="text-sm max-w-xs leading-relaxed text-[#c5c0a0]">
            Dedicated to sustainable agriculture through high-quality organic manure.
          </p>

          <div className="mt-6">
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide">Follow Us</h3>
            <div className="flex space-x-4 justify-center sm:justify-start">
              <Link
                href="https://www.instagram.com/trishikhagold/"
                className="hover:opacity-80 transition-opacity p-2 bg-[#4a493a] rounded-full hover:bg-[#5a594a]"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image src="/insta.svg" alt="Instagram" width={20} height={20} />
              </Link>
              <Link
                href="https://www.facebook.com/profile.php?id=61558978299229"
                className="hover:opacity-80 transition-opacity p-2 bg-[#4a493a] rounded-full hover:bg-[#5a594a]"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image src="/facebook.svg" alt="Facebook" width={20} height={20} />
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
          <h3 className="text-base font-semibold mb-4 uppercase tracking-wide">Quick Links</h3>
          <ul className="space-y-3 text-sm">
            <li>
              <Link href="/" className="hover:text-white transition-colors duration-300 inline-block py-1">
                Home
              </Link>
            </li>
            <li>
              <Link href="/about" className="hover:text-white transition-colors duration-300 inline-block py-1">
                About Us
              </Link>
            </li>
            <li>
              <Link href="/products" className="hover:text-white transition-colors duration-300 inline-block py-1">
                Products
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-white transition-colors duration-300 inline-block py-1">
                Contact
              </Link>
            </li>
            <li>
              <Link href="/privacy-policy" className="hover:text-white transition-colors duration-300 inline-block py-1">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-white transition-colors duration-300 inline-block py-1">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href="/track" className="hover:text-white transition-colors duration-300 inline-block py-1">
                Track Order
              </Link>
            </li>
            <li>
              <Link href="/cancel-order" className="hover:text-white transition-colors duration-300 inline-block py-1">
                Cancel Order
              </Link>
            </li>
          </ul>
        </div>

        {/* Contact Info */}
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left sm:col-span-2 lg:col-span-1">
          <h3 className="text-base font-semibold mb-4 uppercase tracking-wide">Contact Us</h3>
          <ul className="space-y-3 text-sm text-[#c5c0a0]">
            <li className="flex items-start gap-2 justify-center sm:justify-start">
              <span className="shrink-0">📧</span>
              <a href="mailto:trishikhaorganic@gmail.com" className="hover:text-white transition-colors break-all">
                trishikhaorganic@gmail.com
              </a>
            </li>
            <li className="flex items-start gap-2 justify-center sm:justify-start">
              <span className="shrink-0">📞</span>
              <a href="tel:+917984130253" className="hover:text-white transition-colors">
                +91 79841 30253
              </a>
            </li>
            <li className="flex items-start gap-2 justify-center sm:justify-start max-w-sm">
              <span className="shrink-0">📍</span>
              <span>Plot No 27, Swagat Industrial Area Park, Vill. Dhanot, Kadi Chatral Road, Ta. Kalol, Distt: Gandhi Nagar, Gujarat</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Copyright */}
      <div className="mt-8 pt-6 border-t border-[#e0dbb5]/20 text-center text-xs sm:text-sm text-[#a5a085]">
        © {new Date().getFullYear()} Trishikha Organics. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;