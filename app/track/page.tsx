"use client";

import { useState } from "react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { Search, Package, CheckCircle, Clock, MapPin, Truck } from "lucide-react"; // Assuming Lucide React for icons

export default function TrackOrderPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [trackingData, setTrackingData] = useState<any>(null);
  const [error, setError] = useState("");

  const handleTrack = async () => {
    if (!input) return;
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`/api/track?order_id=${input}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setTrackingData(data);
      }
    } catch (err) {
      setError("Network error, please try again.");
    }

    setLoading(false);
  };

  const steps = [
    { title: "Order Placed", icon: Package, done: true },
    { title: "Payment Confirmed", icon: CheckCircle, done: trackingData?.payment_status === "paid" },
    { title: "Preparing for Shipment", icon: Clock, done: false },
    { title: "Shipped", icon: Truck, done: !!trackingData?.awb_number },
    { title: "Delivered", icon: MapPin, done: false }, // Assume delivered based on timeline if needed
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2c2b20] via-[#3d3c30] to-[#464433] text-[#e0dbb5]">
      <Header />
      
      {/* Hero Section */}
      <section className="py-16 px-4 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-[#d1cd9f] to-[#e0dbb5] bg-clip-text text-transparent">
          Track Your Order
        </h1>
        <p className="text-xl opacity-90 max-w-md mx-auto">
          Enter your order ID to get real-time updates on your sustainable organics delivery.
        </p>
      </section>

      {/* Search Box */}
      <section className="max-w-2xl mx-auto px-4 mb-16">
        <div className="bg-[#464433]/80 backdrop-blur-sm border border-[#6a684d]/50 p-8 rounded-3xl shadow-2xl">
          <div className="relative mb-6">
            <label className="block mb-3 text-xl font-semibold text-[#d1cd9f]">
              Enter Your Order ID
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#6a684d] w-5 h-5" />
              <input
                type="text"
                placeholder="Example: ORD123"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-[#3d3c30]/50 border border-[#6a684d]/30 rounded-2xl text-[#e0dbb5] placeholder-[#6a684d]/70 focus:ring-2 focus:ring-[#d1cd9f]/50 focus:border-transparent outline-none transition-all duration-300"
                onKeyDown={(e) => e.key === "Enter" && handleTrack()}
              />
            </div>
          </div>

          <button
            onClick={handleTrack}
            disabled={loading || !input}
            className={`w-full py-4 rounded-2xl font-semibold text-lg transition-all duration-300 transform ${
              loading || !input
                ? "bg-[#6a684d]/50 cursor-not-allowed"
                : "bg-gradient-to-r from-[#d1cd9f] to-[#e0dbb5] text-[#2c2b20] hover:from-[#e0dbb5] hover:to-[#d1cd9f] hover:shadow-lg hover:scale-[1.02]"
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-[#2c2b20]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Tracking...
              </span>
            ) : (
              "Track Order"
            )}
          </button>

          {error && (
            <div className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-center font-medium animate-fade-in">
              {error}
            </div>
          )}
        </div>
      </section>

      {/* Results */}
      {trackingData && (
        <section className="max-w-4xl mx-auto px-4 mb-16">
          <div className="bg-[#464433]/80 backdrop-blur-sm border border-[#6a684d]/50 p-8 rounded-3xl shadow-2xl">
            <h2 className="text-3xl font-bold mb-8 text-center bg-gradient-to-r from-[#d1cd9f] to-[#e0dbb5] bg-clip-text text-transparent">
              Order Status
            </h2>

            {/* Progress Steps */}
            <div className="mb-8">
              <div className="relative">
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#6a684d]/50 to-transparent"></div>
                {steps.map((step, i) => {
                  const Icon = step.icon;
                  const isDone = step.done;
                  const isActive = i < steps.length - 1 && steps.slice(0, i + 1).some(s => s.done);
                  return (
                    <div key={i} className="flex items-center mb-6 relative">
                      <div className="z-10 w-12 h-12 bg-gradient-to-br from-[#3d3c30] to-[#464433] border-2 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-110">
                        <Icon className={`w-6 h-6 ${isDone ? 'text-green-400' : 'text-[#6a684d]'} transition-colors`} />
                      </div>
                      <div className="ml-6 flex-1">
                        <h3 className="font-semibold text-[#d1cd9f]">{step.title}</h3>
                        {isDone && <p className="text-sm text-green-400 mt-1">Completed</p>}
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`absolute left-6 top-12 w-0.5 h-12 ${isActive ? 'bg-green-400' : 'bg-[#6a684d]/30'}`}></div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AWB and External Link */}
            {trackingData.awb_number && (
              <div className="mb-6 p-4 bg-[#3d3c30]/50 rounded-2xl border border-[#6a684d]/30">
                <p className="text-lg mb-2">
                  <strong className="text-[#d1cd9f]">AWB Number:</strong> {trackingData.awb_number}
                </p>
                <a
                  href={trackingData.shiprocket_tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[#d1cd9f] hover:text-[#e0dbb5] underline underline-offset-2 transition-colors"
                >
                  <span>Track on Shiprocket</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}

            {/* Timeline */}
            {trackingData.awb_number && trackingData.timeline?.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-2xl font-bold mb-4 text-[#d1cd9f]">Shipment Timeline</h3>
                <div className="space-y-6">
                  {trackingData.timeline?.map((t: any, i: number) => (
                    <div key={i} className="flex items-start space-x-4 p-4 bg-[#3d3c30]/30 rounded-xl border-l-4 border-green-400">
                      <div className="w-8 h-8 bg-green-400 rounded-full flex items-center justify-center mt-1 flex-shrink-0">
                        <CheckCircle className="w-4 h-4 text-[#2c2b20]" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-[#e0dbb5]">{t.status}</p>
                        <p className="text-sm opacity-80 text-[#6a684d]">{t.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <Footer />
      
      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}