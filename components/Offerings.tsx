import Image from "next/image";
import Link from "next/link";

const products = [
  {
    id: 1,
    name: "Trishikha Gold - 1kg",
    price: "₹ 135.00",
    image: "/product1.jpeg",
  },
  {
    id: 2,
    name: "Trishikha Gold - 5kg",
    price: "₹ 375.00",
    image: "/product22.png",
  },
];

export default function Offerings() {
  return (
    <section className="bg-gradient-to-b from-[#3d3c30] to-[#4a493a] py-20 px-6 lg:px-16">
      {/* Heading */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-16">
        <h2 className="text-4xl md:text-5xl font-sans text-[#e0dbb5]">
          Our Products
        </h2>
        <Link
          href="/products"
          className="mt-6 md:mt-0 inline-block bg-[#e0dbb5] text-[#3d3c30] font-semibold px-6 py-2 rounded-full hover:bg-[#f0eacd] transition-all duration-300 shadow-md hover:shadow-lg"
        >
          Explore All
        </Link>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-6xl mx-auto">
        {products.map((product) => (
          <div
            key={product.id}
            className="bg-white rounded-2xl shadow-lg overflow-hidden transform transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl flex flex-col"
          >
            {/* Product Image */}
            <div className="relative w-full h-64 md:h-72">
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-cover mt-2"
              />
            </div>

            {/* Product Info */}
            <div className="p-6 flex flex-col justify-between flex-grow">
              <h3 className="text-xl font-sans text-gray-800 mb-3">
                {product.name}
              </h3>
              <span className="text-lg font-sans font-bold text-[#3d3c30]">
                {product.price}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
