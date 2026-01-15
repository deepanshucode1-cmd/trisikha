import PaymentSuccessPage from '@/components/PaymentSuccess'
import { Suspense } from 'react'

function LoadingFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#3d3c30] via-[#464433] to-[#3d3c30] text-[#e0dbb5]">
      <div className="relative">
        <div className="h-16 w-16 border-4 border-[#e0dbb5]/20 rounded-full" />
        <div className="absolute inset-0 h-16 w-16 border-4 border-[#e0dbb5] border-t-transparent rounded-full animate-spin" />
      </div>
      <p className="mt-4 text-[#c5c0a0]">Processing your order...</p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PaymentSuccessPage />
    </Suspense>
  )
}