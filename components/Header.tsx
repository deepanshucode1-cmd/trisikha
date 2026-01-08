"use client";
import { useState } from "react";
import { ShoppingCart, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/utils/store/cartStore";

const navLinks = [
  { name: "Home", href: "/" },
  { name: "About us", href: "/about" },
  { name: "Products", href: "/products" },
];

const Header = () => {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const itemsInCart = useCartStore(
    (state) => state.items.reduce((sum, item) => sum + item.quantity, 0)
  );

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="bg-gradient-to-r from-[#3d3c30] to-[#2f2e25] text-[#e0dbb5] shadow-md sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-16 py-3 lg:py-4">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center hover:scale-105 transition-transform duration-300"
          onClick={closeMobileMenu}
        >
          <Image
            src="/trisikha-logo-img.png"
            alt="Trishikha Logo"
            width={110}
            height={40}
            className="object-contain w-[90px] sm:w-[110px] lg:w-[130px]"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex justify-center space-x-6 lg:space-x-10 text-base lg:text-lg font-bold">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative transition-colors duration-300 ${
                pathname === link.href ? "text-white" : "hover:text-white"
              }`}
            >
              {link.name}
              <span
                className={`absolute left-0 -bottom-1 h-[2px] w-full bg-white scale-x-0 transition-transform duration-300 ${
                  pathname === link.href ? "scale-x-100" : "hover:scale-x-100"
                }`}
              />
            </Link>
          ))}
        </nav>

        {/* Right side - Cart & Mobile Menu Button */}
        <div className="flex items-center gap-4">
          {/* Cart Icon */}
          <Link
            href="/cart"
            className="relative hover:scale-110 transition-transform duration-300"
            onClick={closeMobileMenu}
          >
            <ShoppingCart className="w-6 h-6 lg:w-7 lg:h-7 text-[#e0dbb5]" />
            {itemsInCart > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                {itemsInCart}
              </span>
            )}
          </Link>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-[#4a493a] transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          mobileMenuOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <nav className="flex flex-col px-4 pb-4 space-y-1 bg-[#2f2e25]">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeMobileMenu}
              className={`py-3 px-4 rounded-lg text-base font-semibold transition-colors duration-200 ${
                pathname === link.href
                  ? "bg-[#4a493a] text-white"
                  : "hover:bg-[#3d3c30] hover:text-white"
              }`}
            >
              {link.name}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Header;
