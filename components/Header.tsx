"use client";
import { ShoppingCart } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/utils/store/cartStore";

const Header = () => {
  const pathname = usePathname();
 const itemsInCart = useCartStore(
  (state) => state.items.reduce((sum, item) => sum + item.quantity, 0)
);
 console.log("Items in cart:", itemsInCart);

  return (
    <header className="bg-gradient-to-r from-[#3d3c30] to-[#2f2e25] text-[#e0dbb5] flex items-center  justify-between px-16 py-4 shadow-md">
      {/* Logo */}
      <Link href="/" className="flex items-center hover:scale-105 transition-transform duration-300">
        <Image
          src="/trisikha-logo-img.png"
          alt="Trishikha Logo"
          width={130}
          height={50}
          className="object-contain"
        />
      </Link>

      {/* Navigation */}
      <nav className="flex1 flex justify-center space-x-10 text-lg font-bold ml-8">
        {[
          { name: "Home", href: "/" },
          { name: "About us", href: "/about" },
          { name: "Products", href: "/products" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`relative transition-colors duration-300  ${
              pathname === link.href ? "text-white" : "hover:text-white"
            }`}
          >
            {link.name}
            {/* Underline animation */}
            <span
              className={`absolute left-0 -bottom-1 h-[2px] w-full bg-white scale-x-0 transition-transform duration-300 ${
                pathname === link.href ? "scale-x-100" : "hover:scale-x-100"
              }`}
            />
          </Link>
        ))}
      </nav>

            <Link
        href="/cart"
        className="relative flex justify-end hover:scale-110 transition-transform duration-300"
      >
        <ShoppingCart className="w-7 h-7 text-[#e0dbb5]" />
        {/* Example for cart count badge */}
        <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full px-1.5 py-0.5">
          {itemsInCart}
        </span>
      </Link>
    
    </header>
  );
};

export default Header;
