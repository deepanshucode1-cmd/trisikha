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
            <p className="text-gray-600">Last updated: February 2026</p>
          </div>

          {/* Content */}
          <div className="prose prose-lg max-w-none space-y-8">
            {/* Introduction */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">1. Introduction</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Welcome to Trishikha Organics (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or make a purchase from us.
              </p>
              <p className="text-gray-700 leading-relaxed">
                This policy is published in compliance with the Digital Personal Data Protection (DPDP) Act, 2023 and the DPDP Rules, 2025 notified by the Government of India. We act as a &quot;Data Fiduciary&quot; under the DPDP Act for the personal data we process.
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
              <p className="text-gray-700 leading-relaxed mb-4">
                We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required by law.
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>Order and transaction data:</strong> Retained for a minimum of 8 years from the end of the relevant financial year, as required under Section 36 of the Central Goods and Services Tax (CGST) Act, 2017.</li>
                <li><strong>Non-transactional personal data:</strong> Deleted upon request or when the purpose for collection has been fulfilled, subject to the 14-day cooling-off period under the DPDP Rules, 2025.</li>
                <li><strong>Inactive accounts:</strong> Data associated with accounts inactive for over 1 year may be scheduled for deletion, with prior notice to you.</li>
              </ul>
            </section>

            {/* Your Rights */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">7. Your Rights as a Data Principal</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Under the DPDP Act, 2023 and DPDP Rules, 2025, you (&quot;Data Principal&quot;) have the following rights regarding your personal data:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>Right to Access (Rule 14):</strong> Request a summary of your personal data we hold and the processing activities performed on it.</li>
                <li><strong>Right to Correction (Rule 14):</strong> Request correction of inaccurate or incomplete personal data, including your name, email, phone number, and address. Correction requests are reviewed and processed by our team.</li>
                <li><strong>Right to Erasure (Rule 8):</strong> Request deletion of your personal data. Deletion requests are subject to a 14-day cooling-off period during which you may cancel. Data associated with paid orders is retained for 8 years as required by tax law.</li>
                <li><strong>Right to Data Portability:</strong> Request your personal data in a commonly used, machine-readable format (JSON).</li>
                <li><strong>Right to Nominate (Rule 14):</strong> Appoint a nominee who may exercise your rights on your behalf in the event of your death or incapacity.</li>
                <li><strong>Opt-out:</strong> Unsubscribe from marketing communications at any time.</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                To exercise any of these rights, visit your data management page at <a href="/my-data" className="text-blue-600 hover:underline">/my-data</a> or contact us at <a href="mailto:trishikhaorganic@gmail.com" className="text-blue-600 hover:underline">trishikhaorganic@gmail.com</a>.
              </p>
            </section>

            {/* Grievance Redressal */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">8. Grievance Redressal</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                In accordance with Rule 14 of the DPDP Rules, 2025, if you have any concerns or complaints regarding the processing of your personal data, you may submit a grievance to us. We are committed to resolving all grievances within <strong>90 days</strong> of receipt.
              </p>
              <div className="text-gray-700 space-y-2 mb-4">
                <p><strong>Grievance Officer:</strong></p>
                <p>Name: Trishikha Organics Grievance Cell</p>
                <p>Email: <a href="mailto:trishikhaorganic@gmail.com" className="text-blue-600 hover:underline">trishikhaorganic@gmail.com</a></p>
                <p>Phone: <a href="tel:+917984130253" className="text-blue-600 hover:underline">+91 79841 30253</a></p>
              </div>
              <p className="text-gray-700 leading-relaxed">
                If your grievance is not resolved within the stipulated time, or if you are not satisfied with our response, you may file a complaint with the Data Protection Board of India as established under the DPDP Act, 2023.
              </p>
            </section>

            {/* Nominee Appointment */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">9. Nominee Appointment</h2>
              <p className="text-gray-700 leading-relaxed">
                Under Rule 14 of the DPDP Rules, 2025, you have the right to appoint a nominee who may exercise your data principal rights on your behalf in the event of your death or incapacity. To appoint or update a nominee, please contact us at <a href="mailto:trishikhaorganic@gmail.com" className="text-blue-600 hover:underline">trishikhaorganic@gmail.com</a>.
              </p>
            </section>

            {/* Cookies */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">10. Cookies</h2>
              <p className="text-gray-700 leading-relaxed">
                We use essential cookies to ensure the proper functioning of our website, including maintaining your shopping cart and authentication status. We do not use third-party tracking or advertising cookies.
              </p>
            </section>

            {/* Changes to This Policy */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">11. Changes to This Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date. We encourage you to review this Privacy Policy periodically.
              </p>
            </section>

            {/* Contact Us */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">12. Contact Us</h2>
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
