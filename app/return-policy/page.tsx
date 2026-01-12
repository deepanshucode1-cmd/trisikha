import Footer from '@/components/Footer';
import Header from '@/components/Header';
import Link from 'next/link';

export const metadata = {
  title: 'Return Policy | Trishikha Organics',
  description: 'Return Policy for Trishikha Organics - Learn about our 48-hour return window, refund process, and shipping cost deductions.',
};

export default function ReturnPolicy() {
  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#3d3c30]">
      <Header />

      <main className="py-12 sm:py-16 px-4 sm:px-6 lg:px-16">
        <div className="max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">Return Policy</h1>
            <p className="text-gray-600">Last updated: January 2026</p>
          </div>

          {/* Content */}
          <div className="prose prose-lg max-w-none space-y-8">
            {/* Introduction */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">1. Introduction</h2>
              <p className="text-gray-700 leading-relaxed">
                At Trishikha Organics, we want you to be completely satisfied with your purchase. If you&apos;re not happy with your order, you may request a return within 48 hours of shipment pickup. We strive to make our return process as simple and hassle-free as possible.
              </p>
            </section>

            {/* Eligibility */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">2. Eligibility for Returns</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                To be eligible for a return, the following conditions must be met:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>Return Window:</strong> Returns must be requested within 48 hours of shipment pickup by our courier partner</li>
                <li><strong>Product Condition:</strong> Product must be unused, unopened, and in its original packaging</li>
                <li><strong>Order Status:</strong> Order must be in &quot;Picked Up&quot; or &quot;Delivered&quot; status</li>
                <li><strong>Proof of Purchase:</strong> Original receipt or order confirmation required</li>
              </ul>
            </section>

            {/* Non-Returnable Items */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">3. Non-Returnable Items</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                The following items cannot be returned:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Products that have been opened or used</li>
                <li>Products without original packaging</li>
                <li>Items marked as &quot;Final Sale&quot; or &quot;Non-Returnable&quot;</li>
                <li>Orders where the 48-hour return window has expired</li>
                <li>Products that show signs of damage caused by the customer</li>
              </ul>
            </section>

            {/* How to Request a Return */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">4. How to Request a Return</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Follow these steps to request a return:
              </p>
              <ol className="list-decimal pl-6 space-y-3 text-gray-700">
                <li>
                  <strong>Visit the Cancel Order page</strong>
                  <p className="text-gray-600 mt-1">Go to <Link href="/cancel-order" className="text-blue-600 hover:underline">/cancel-order</Link> on our website</p>
                </li>
                <li>
                  <strong>Enter your Order ID and email address</strong>
                  <p className="text-gray-600 mt-1">You can find your Order ID in the confirmation email we sent you</p>
                </li>
                <li>
                  <strong>Verify your identity</strong>
                  <p className="text-gray-600 mt-1">Enter the 6-digit OTP sent to your email address</p>
                </li>
                <li>
                  <strong>Provide a reason for return</strong>
                  <p className="text-gray-600 mt-1">Optional but helps us improve our service</p>
                </li>
                <li>
                  <strong>Wait for pickup</strong>
                  <p className="text-gray-600 mt-1">Our courier partner will contact you to schedule a pickup</p>
                </li>
              </ol>
            </section>

            {/* Refund Calculation */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">5. Refund Calculation</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                For returns, the refund amount is calculated as follows:
              </p>
              <div className="bg-[#f5f5f0] rounded-lg p-4 mb-4">
                <p className="text-center font-semibold text-lg text-[#3d3c30]">
                  Refund Amount = Order Total - (2 x Shipping Cost)
                </p>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Both-ways shipping cost is deducted from the refund amount to cover:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Original shipping cost (delivery to you)</li>
                <li>Return shipping cost (pickup from you)</li>
              </ul>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                <p className="text-amber-800 text-sm">
                  <strong>Example:</strong> If your order total was ₹1,000 with ₹50 shipping, your refund would be ₹1,000 - (₹50 x 2) = ₹900
                </p>
              </div>
            </section>

            {/* Refund Timeline */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">6. Refund Timeline</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Here&apos;s what to expect after requesting a return:
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-[#3d3c30] text-white rounded-full flex items-center justify-center flex-shrink-0">1</div>
                  <div>
                    <p className="font-semibold text-gray-800">Return Pickup Scheduled</p>
                    <p className="text-gray-600 text-sm">2-3 business days after your return request</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-[#3d3c30] text-white rounded-full flex items-center justify-center flex-shrink-0">2</div>
                  <div>
                    <p className="font-semibold text-gray-800">Product Received at Warehouse</p>
                    <p className="text-gray-600 text-sm">3-5 business days after pickup</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-[#3d3c30] text-white rounded-full flex items-center justify-center flex-shrink-0">3</div>
                  <div>
                    <p className="font-semibold text-gray-800">Refund Processed</p>
                    <p className="text-gray-600 text-sm">5-7 business days after product received</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">Amount Credited</p>
                    <p className="text-gray-600 text-sm">Refund credited to your original payment method</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Cancellation vs Return */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">7. Cancellation vs Return</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Understanding the difference:
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-800 mb-2">Cancellation (Before Shipment)</h3>
                  <ul className="text-sm text-green-700 space-y-1">
                    <li>Full refund of order amount</li>
                    <li>No shipping cost deducted</li>
                    <li>Available before courier pickup</li>
                  </ul>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h3 className="font-semibold text-amber-800 mb-2">Return (After Shipment)</h3>
                  <ul className="text-sm text-amber-700 space-y-1">
                    <li>Refund minus both-ways shipping</li>
                    <li>Available within 48 hours of pickup</li>
                    <li>Requires product return pickup</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Contact Us */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">8. Contact Us</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                If you have any questions about our Return Policy or need assistance with a return, please contact us:
              </p>
              <div className="text-gray-700 space-y-2">
                <p><strong>Trishikha Organics</strong></p>
                <p>Email: <a href="mailto:trishikhaorganic@gmail.com" className="text-blue-600 hover:underline">trishikhaorganic@gmail.com</a></p>
                <p>Phone: <a href="tel:+917984130253" className="text-blue-600 hover:underline">+91 79841 30253</a></p>
                <p>Address: Plot No 27, Swagat Industrial Area Park, Vill. Dhanot, Kadi Chatral Road, Ta. Kalol, Distt: Gandhi Nagar, Gujarat</p>
              </div>
            </section>
          </div>

          {/* Back Link */}
          <div className="mt-12 text-center">
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-[#3d3c30] text-[#e0dbb5] rounded-full hover:bg-[#4a493a] transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
