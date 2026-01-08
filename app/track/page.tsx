"use client";

import { useState, useMemo, Suspense } from "react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { Search, Package, CheckCircle, Clock, MapPin, Truck, UserCheck, ArrowUpRight, FileText } from "lucide-react";
import { useSearchParams } from "next/navigation";

// Validation rules based on backend schema
const validation = {
  orderId: {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    message: "Please enter a valid Order ID (UUID format)",
  },
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: "Please enter a valid email address",
  },
};

function TrackOrderContent() {
  const [input, setInput] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [trackingData, setTrackingData] = useState<any>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  // Validation state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");
  const emailParam = searchParams.get("email");

  if(orderId && !input){
    setInput(orderId);
  }
  if(emailParam && !email){
    setEmail(emailParam);
  }

  // Validate a single field
  const validateField = (field: string, value: string): string => {
    if (field === "orderId") {
      if (!value) return "Order ID is required";
      if (!validation.orderId.pattern.test(value)) return validation.orderId.message;
    }
    if (field === "email") {
      if (!value) return "Email is required";
      if (!validation.email.pattern.test(value)) return validation.email.message;
    }
    return "";
  };

  // Handle field blur
  const handleBlur = (field: string, value: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const fieldError = validateField(field, value);
    setFieldErrors((prev) => ({ ...prev, [field]: fieldError }));
  };

  // Check if form is valid
  const isFormValid = () => {
    const orderIdError = validateField("orderId", input);
    const emailError = validateField("email", email);
    return !orderIdError && !emailError;
  };

  const handleTrack = async () => {
    // Validate before tracking
    const orderIdError = validateField("orderId", input);
    const emailError = validateField("email", email);

    setFieldErrors({ orderId: orderIdError, email: emailError });
    setTouched({ orderId: true, email: true });

    if (orderIdError || emailError) return;
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`/api/track?order_id=${encodeURIComponent(input.trim())}&email=${encodeURIComponent(email.trim())}`);
      const data = await response.json();

      console.log(data);
      if (!response.ok) {
        setError(data.error || "Something went wrong");
        setTrackingData(null);
        setResult(null);
      } else {
        setTrackingData(data);
        setResult(data);
      }
    } catch (err) {
      console.error(err);
      setError("Network error, please try again.");
      setTrackingData(null);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Comprehensive mapping from sr-status-label to step index for dynamic progress
  // Expanded based on common Shiprocket statuses; easy to extend for variations
  const statusToStepIndex = useMemo(() => ({
    'NA': 0,
    'MANIFEST GENERATED': 0,
    'PENDING MANIFEST': 0, // If encountered
    'OUT FOR PICKUP': 1,
    'PICKED UP': 2,
    'SHIPPED': 3,
    'PICKED': 3, // Alias
    'IN TRANSIT': 4,
    'REACHED AT DESTINATION HUB': 5,
    'OUT FOR DELIVERY': 6,
    'DELIVERED': 7,
    // Add RTO or other variants as needed, e.g., 'RTO INITIATED': 8
  }), []);

  // Extract timeline activities from Shiprocket data if available, fallback to trackingData.timeline
  // Include sr-status-label and full activity for details
  const timelineActivities = useMemo(() => {
    let activities: any[] = [];

    if(result === null) return activities;
    if(result.stage === "PAYMENT_NOT_CONFIRMED"){
      activities.push({
        srStatusLabel: "PAYMENT NOT CONFIRMED",
        status: "Payment Not Confirmed",
        detail: "Awaiting payment confirmation to proceed with order processing.",
        location: null,
        originalDate: new Date(), // Current time as placeholder
        time: new Date(result.order.updated_at).toLocaleString('en-IN', { 
          year: 'numeric', month: 'short', day: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
        }),
        isDone: false,
      });
    }
    if(result.stage === "PAYMENT_CONFIRMED_AWB_NOT_ASSIGNED"){
      activities.push({
        srStatusLabel: "PAYMENT CONFIRMED",
        status: "Payment Confirmed",
        detail: "Your order has been confirmed and is waiting for courier assignment by seller.",
        location: null,
        originalDate: new Date(), // Current time as placeholder
        time: new Date(result.order.updated_at).toLocaleString('en-IN', { 
          year: 'numeric', month: 'short', day: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
        }),
        isDone: true,
      });

      console.log('result.order.updated_at:', new Date(result.order.updated_at).toLocaleString('en-IN', { 
          year: 'numeric', month: 'short', day: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
        }));
    }  

    if (result?.shiprocket?.tracking_data?.shipment_track_activities?.length > 0) {
      if (result?.shiprocket?.tracking_data?.shipment_track_activities?.length > 0) {
  const mappedActivities = result.shiprocket.tracking_data.shipment_track_activities.map((item: any) => ({
    srStatusLabel: item["sr-status-label"],
    status: item["sr-status-label"] || item.activity,
    detail: item.activity !== item["sr-status-label"] ? item.activity : null,
    location: item.location,
    originalDate: new Date(item.date),
    time: new Date(item.date).toLocaleString('en-IN', { 
      year: 'numeric', month: 'short', day: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    }),
    isDone: true,
  }));
  activities.push(...mappedActivities);  // Spread to flatten
}
    }

    // Filter NA, sort chronological (oldest first) using originalDate, unique by srStatusLabel if needed
    return activities
      .filter(activity => activity.srStatusLabel !== 'NA')
      .sort((a, b) => a.originalDate.getTime() - b.originalDate.getTime()) // Use originalDate for sorting
      .filter((activity, index, self) => 
        index === self.findIndex(a => a.srStatusLabel === activity.srStatusLabel)
      ); // Dedupe if multiple same status
  }, [result, trackingData]);

  // Dynamic steps aligned with possible sr-status-labels
  const baseSteps = useMemo(() => [
    { title: "Order Confirmed", icon: Package, description: "Order placed and payment verified" },
    { title: "Out for Pickup", icon: Truck, description: "Courier dispatched for collection" },
    { title: "Picked Up", icon: UserCheck, description: "Shipment collected from origin" },
    { title: "Shipped", icon: ArrowUpRight, description: "En route to destination" },
    { title: "In Transit", icon: MapPin, description: "Moving through hubs" },
    { title: "Reached Destination", icon: MapPin, description: "Arrived at local hub" },
    { title: "Out for Delivery", icon: Clock, description: "Final dispatch to you" },
    { title: "Delivered", icon: CheckCircle, description: "Successfully received" },
  ], []);

  // Compute steps dynamically based on actual activities
  const steps = useMemo(() => {
    if (!trackingData || timelineActivities.length === 0) {
      return baseSteps.map(step => ({ ...step, done: false }));
    }

    // Calculate max progress from all achieved statuses (handles variations/skips)
    const indices = timelineActivities.map((activity: any) => statusToStepIndex[activity.srStatusLabel as keyof typeof statusToStepIndex] ?? 0);
    const maxProgress = Math.max(...indices, 0);

    // Assume linear flow: all steps up to max are done; allows for shipment-specific variations
    return baseSteps.map((step, index) => ({
      ...step,
      done: index <= maxProgress,
    }));
  }, [trackingData, timelineActivities, statusToStepIndex, baseSteps]);

  // Get current stage: first undone step, or "Delivered" if all done
  const currentStageIndex = steps.findIndex(step => !step.done);
  const isDelivered = currentStageIndex === -1;
  const currentStatus = isDelivered ? "Delivered" : steps[currentStageIndex]?.title || "In Progress";

  // Helper: Get tracking number safely
  const trackingNumber = trackingData?.order.shiprocket_awb_code || result?.shiprocket?.tracking_data?.awb_code;
  const hasTrackingNumber = !!trackingNumber;
  const trackUrl = trackingData?.shiprocket_tracking_url || result?.shiprocket?.tracking_data?.track_url;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2c2b20] via-[#3d3c30] to-[#464433] text-[#e0dbb5]">
      <Header />
      
      {/* Hero Section */}
      <section className="py-16 px-4 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-[#d1cd9f] to-[#e0dbb5] bg-clip-text text-transparent">
          Track Your Order
        </h1>
        <p className="text-xl opacity-90 max-w-md mx-auto">
          Enter your order ID and email to get real-time updates on your delivery.
        </p>
      </section>

      {/* Search Box */}
      <section className="max-w-2xl mx-auto px-4 mb-16">
        <div className="bg-[#464433]/80 backdrop-blur-sm border border-[#6a684d]/50 p-8 rounded-3xl shadow-2xl">
          <div className="relative mb-6">
            <label className="block mb-3 text-xl font-semibold text-[#d1cd9f]">
              Order ID
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#6a684d] w-5 h-5" />
              <input
                type="text"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={input}
                onChange={(e) => setInput(e.target.value.trim())}
                onBlur={() => handleBlur("orderId", input)}
                className={`w-full pl-12 pr-4 py-4 bg-[#3d3c30]/50 border rounded-2xl text-[#e0dbb5] placeholder-[#6a684d]/70 focus:ring-2 focus:border-transparent outline-none transition-all duration-300 ${
                  touched.orderId && fieldErrors.orderId
                    ? "border-red-500 focus:ring-red-500/50"
                    : "border-[#6a684d]/30 focus:ring-[#d1cd9f]/50"
                }`}
                onKeyDown={(e) => e.key === "Enter" && handleTrack()}
              />
            </div>
            {touched.orderId && fieldErrors.orderId && (
              <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {fieldErrors.orderId}
              </p>
            )}
          </div>

          <div className="relative mb-6">
            <label className="block mb-3 text-xl font-semibold text-[#d1cd9f]">
              Email Address
            </label>
            <div className="relative">
              <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#6a684d] w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                onBlur={() => handleBlur("email", email)}
                className={`w-full pl-12 pr-4 py-4 bg-[#3d3c30]/50 border rounded-2xl text-[#e0dbb5] placeholder-[#6a684d]/70 focus:ring-2 focus:border-transparent outline-none transition-all duration-300 ${
                  touched.email && fieldErrors.email
                    ? "border-red-500 focus:ring-red-500/50"
                    : "border-[#6a684d]/30 focus:ring-[#d1cd9f]/50"
                }`}
                onKeyDown={(e) => e.key === "Enter" && handleTrack()}
              />
            </div>
            {touched.email && fieldErrors.email ? (
              <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {fieldErrors.email}
              </p>
            ) : (
              <p className="mt-2 text-sm text-[#6a684d]">
                Enter the email address used when placing your order
              </p>
            )}
          </div>

          <button
            onClick={handleTrack}
            disabled={loading || !isFormValid()}
            className={`w-full py-4 rounded-2xl font-semibold text-lg transition-all duration-300 transform ${
              loading || !isFormValid()
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

            {/* Progress Steps - Horizontal Stepper for Desktop, Vertical for Mobile */}
            <div className="mb-8 relative">
              {/* Vertical line for connection */}
              <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#6a684d]/50 to-transparent transform -translate-x-1/2"></div>
              
              <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-6 md:space-y-0 md:gap-0">
                
              </div>

              {/* Mobile Vertical Connectors */}
              <div className="md:hidden mt-4 space-y-6">
                {steps.slice(0, -1).map((_, i) => (
                  <div
                    key={i}
                    className={`w-full h-0.5 ${i < (isDelivered ? steps.length - 1 : currentStageIndex) ? 'bg-green-400' : 'bg-[#6a684d]/30'}`}
                  />
                ))}
              </div>
            </div>

            {/* AWB and External Link - Hide if no number */}
            {hasTrackingNumber && (
              <div className="mb-6 p-4 bg-[#3d3c30]/50 rounded-2xl border border-[#6a684d]/30">
                <p className="text-lg mb-2 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#d1cd9f]" />
                  <strong className="text-[#d1cd9f]">Tracking Number:</strong> 
                  {trackingNumber}
                </p>
                {trackUrl && (
                  <a
                    href={trackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-[#d1cd9f] hover:text-[#e0dbb5] underline underline-offset-2 transition-colors"
                  >
                    <span>Track on Shiprocket</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </a>
                )}
              </div>
            )}

            {/* Shipment Timeline - Using sr-status-label as primary status */}
            {timelineActivities.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-2xl font-bold mb-4 text-[#d1cd9f] flex items-center gap-2">
                  <Truck className="w-6 h-6" />
                  Shipment Timeline
                  <span className="text-sm opacity-70 ml-2">({timelineActivities.length} updates)</span>
                </h3>
                <div className="relative border-l-4 border-[#6a684d]/50 pl-4 space-y-6">
                  {timelineActivities.map((activity: any, i: number) => {
                    const stepIndex = statusToStepIndex[activity.srStatusLabel as keyof typeof statusToStepIndex] ?? 0;
                    const matchingStep = baseSteps[stepIndex];
                    return (
                      <div key={i} className={`flex items-start space-x-4 p-4 bg-[#3d3c30]/30 rounded-xl border-l-4 ${
                        matchingStep ? 'border-green-400/50' : 'border-[#d1cd9f]/30'
                      }`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mt-1 flex-shrink-0 shadow-md ${
                          matchingStep ? 'bg-green-400' : 'bg-[#d1cd9f]/20'
                        }`}>
                          {matchingStep ? (
                            <matchingStep.icon className="w-4 h-4 text-[#2c2b20]" />
                          ) : (
                            <FileText className="w-4 h-4 text-[#d1cd9f]" /> // Always fallback to avoid undefined
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[#e0dbb5] truncate">{activity.status}</p>
                          {activity.detail && (
                            <p className="text-sm opacity-80 text-[#6a684d] mt-1 line-clamp-2">{activity.detail}</p>
                          )}
                          {activity.location && (
                            <p className="text-sm opacity-80 text-[#6a684d] flex items-center gap-1 mt-1">
                              <MapPin className="w-4 h-4" />
                              {activity.location}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No Timeline Fallback */}
            {timelineActivities.length === 0 && (
              <div className="text-center py-8 text-[#6a684d] italic">
                No detailed timeline available yet. Check back soon for updates!
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
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#3d3c30] text-[#e0dbb5] flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    }>
      <TrackOrderContent />
    </Suspense>
  );
}