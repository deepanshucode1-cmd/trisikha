import PaymentSuccessPage from '@/components/PaymentSuccess'
import { Suspense } from 'react'

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#3d3c30] text-[#e0dbb5]">
      <div className="animate-pulse">Loading...</div>
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