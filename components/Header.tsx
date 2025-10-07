"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const Header = () => {
  const pathname = usePathname();

  return (
    <header className="bg-gradient-to-r from-[#3d3c30] to-[#2f2e25] text-[#e0dbb5] flex items-center  px-16 py-4 shadow-md">
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
    </header>
  );
};

export default Header;
