import ReviewPage from "@/components/ReviewPage";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="min-h-screen bg-[#2f2e25] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#3d3c30] rounded-xl p-8 text-center">
          <h2 className="text-xl font-bold text-[#e0dbb5] mb-2">Missing Token</h2>
          <p className="text-[#c5c0a0]">
            No review token provided. Please use the review link from your delivery email.
          </p>
        </div>
      </div>
    );
  }

  return <ReviewPage token={token} />;
}
