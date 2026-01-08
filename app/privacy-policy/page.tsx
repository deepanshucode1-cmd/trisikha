import Footer from '@/components/Footer';
import Header from '@/components/Header';
import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | Trishikha Organics',
  description: 'Privacy Policy for Trishikha Organics - Learn how we collect, use, and protect your personal information.',
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#3d3c30]">
      <Header />

      <main className="py-12 sm:py-16 px-4 sm:px-6 lg:px-16">
        <div className="max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">Privacy Policy</h1>
            <p className="text-gray-600">Last updated: January 2025</p>
          </div>

          {/* Content */}
          <div className="prose prose-lg max-w-none space-y-8">
            {/* Introduction */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">1. Introduction</h2>
              <p className="text-gray-700 leading-relaxed">
                Welcome to Trishikha Organics (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or make a purchase from us.
              </p>
            </section>

            {/* Information We Collect */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">2. Information We Collect</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We collect information that you provide directly to us when you:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Place an order on our website</li>
                <li>Create an account or sign up for our newsletter</li>
                <li>Contact us with inquiries or feedback</li>
                <li>Participate in surveys or promotions</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                <strong>Personal information we collect includes:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mt-2">
                <li>Name (first and last name)</li>
                <li>Email address</li>
                <li>Phone number</li>
                <li>Shipping and billing address</li>
                <li>Payment information (processed securely via Razorpay)</li>
              </ul>
            </section>

            {/* How We Use Your Information */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">3. How We Use Your Information</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We use the information we collect for the following purposes:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>Order Processing:</strong> To process and fulfill your orders, including shipping and delivery</li>
                <li><strong>Communication:</strong> To send order confirmations, shipping updates, and respond to your inquiries</li>
                <li><strong>Customer Service:</strong> To provide customer support and handle returns or refunds</li>
                <li><strong>Marketing:</strong> To send promotional emails (only with your consent)</li>
                <li><strong>Legal Compliance:</strong> To comply with applicable laws and regulations</li>
              </ul>
            </section>

            {/* Third-Party Services */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">4. Third-Party Services</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We use trusted third-party services to operate our business:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>Razorpay:</strong> For secure payment processing. Your payment information is handled directly by Razorpay and is subject to their privacy policy.</li>
                <li><strong>Shiprocket:</strong> For order fulfillment and shipping. We share your shipping address with our logistics partners to deliver your orders.</li>
                <li><strong>Supabase:</strong> For secure data storage and authentication.</li>
              </ul>
            </section>

            {/* Data Security */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">5. Data Security</h2>
              <p className="text-gray-700 leading-relaxed">
                We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. This includes:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mt-4">
                <li>SSL/TLS encryption for all data transmission</li>
                <li>Secure payment processing through Razorpay (PCI-DSS compliant)</li>
                <li>Regular security assessments and updates</li>
                <li>Access controls and authentication measures</li>
              </ul>
            </section>

            {/* Data Retention */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">6. Data Retention</h2>
              <p className="text-gray-700 leading-relaxed">
                We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required by law. Order information is retained for a minimum of 7 years for tax and legal compliance purposes.
              </p>
            </section>

            {/* Your Rights */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">7. Your Rights</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                You have the following rights regarding your personal information:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information (subject to legal obligations)</li>
                <li><strong>Opt-out:</strong> Unsubscribe from marketing communications at any time</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                To exercise any of these rights, please contact us at <a href="mailto:trishikhaorganic@gmail.com" className="text-blue-600 hover:underline">trishikhaorganic@gmail.com</a>.
              </p>
            </section>

            {/* Cookies */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">8. Cookies</h2>
              <p className="text-gray-700 leading-relaxed">
                We use essential cookies to ensure the proper functioning of our website, including maintaining your shopping cart and authentication status. We do not use third-party tracking or advertising cookies.
              </p>
            </section>

            {/* Changes to This Policy */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">9. Changes to This Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date. We encourage you to review this Privacy Policy periodically.
              </p>
            </section>

            {/* Contact Us */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">10. Contact Us</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                If you have any questions about this Privacy Policy or our data practices, please contact us:
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
