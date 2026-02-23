import Footer from '@/components/Footer';
import Header from '@/components/Header';
import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | Trishikha Organics',
  description: 'Terms of Service for Trishikha Organics - Read our terms and conditions for using our website and services.',
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#3d3c30]">
      <Header />

      <main className="py-12 sm:py-16 px-4 sm:px-6 lg:px-16">
        <div className="max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">Terms of Service</h1>
            <p className="text-gray-600">Last updated: January 2025</p>
          </div>

          {/* Content */}
          <div className="prose prose-lg max-w-none space-y-8">
            {/* Introduction */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">1. Introduction</h2>
              <p className="text-gray-700 leading-relaxed">
                Welcome to Trishikha Organics. These Terms of Service (&quot;Terms&quot;) govern your use of our website located at www.trishikhaorganics.com (the &quot;Site&quot;) and any purchases made through the Site. By accessing or using our Site, you agree to be bound by these Terms. If you do not agree to these Terms, please do not use our Site.
              </p>
            </section>

            {/* Eligibility */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">2. Eligibility</h2>
              <p className="text-gray-700 leading-relaxed">
                To use our Site and make purchases, you must be at least 18 years of age or have the consent of a parent or guardian. By using our Site, you represent and warrant that you meet these requirements.
              </p>
            </section>

            {/* Products and Pricing */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">3. Products and Pricing</h2>
              <ul className="list-disc pl-6 space-y-3 text-gray-700">
                <li><strong>Product Descriptions:</strong> We strive to provide accurate descriptions and images of our products. However, we do not warrant that product descriptions, images, or other content on the Site are accurate, complete, or error-free.</li>
                <li><strong>Pricing:</strong> All prices are listed in Indian Rupees (INR) and include applicable taxes unless otherwise stated. We reserve the right to change prices at any time without prior notice.</li>
                <li><strong>Availability:</strong> Products are subject to availability. We reserve the right to limit quantities or discontinue products without notice.</li>
              </ul>
            </section>

            {/* Orders and Payment */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">4. Orders and Payment</h2>
              <ul className="list-disc pl-6 space-y-3 text-gray-700">
                <li><strong>Order Acceptance:</strong> Your order constitutes an offer to purchase. We reserve the right to accept or reject any order for any reason, including product availability, errors in pricing, or suspected fraud.</li>
                <li><strong>Payment:</strong> We accept payments through Razorpay, which supports various payment methods including UPI, credit/debit cards, and net banking. All payments are processed securely.</li>
                <li><strong>Order Confirmation:</strong> Upon successful payment, you will receive an order confirmation email with your order details and tracking information once shipped.</li>
              </ul>
            </section>

            {/* Shipping and Delivery */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">5. Shipping and Delivery</h2>
              <ul className="list-disc pl-6 space-y-3 text-gray-700">
                <li><strong>Shipping:</strong> We ship to locations across India through our logistics partners. Shipping costs and estimated delivery times are displayed at checkout.</li>
                <li><strong>Delivery:</strong> Delivery times are estimates and may vary based on location and other factors. We are not responsible for delays caused by shipping carriers or circumstances beyond our control.</li>
                <li><strong>Risk of Loss:</strong> The risk of loss and title for products pass to you upon delivery to the shipping carrier.</li>
              </ul>
            </section>

            {/* Returns and Refunds */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">6. Returns and Refunds</h2>
              <ul className="list-disc pl-6 space-y-3 text-gray-700">
                <li><strong>Return Policy:</strong> Due to the nature of our organic products, we only accept returns for damaged or defective items. You must notify us within 48 hours of delivery with photographic evidence.</li>
                <li><strong>Refunds:</strong> Approved refunds will typically be processed within 5-7 business days to your original payment method, or may take longer depending on your bank and payment method.</li>
                <li><strong>Cancellations:</strong> Orders can be cancelled before shipment. Once shipped, the order cannot be cancelled and the return policy will apply.</li>
              </ul>
            </section>

            {/* User Conduct */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">7. User Conduct</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                By using our Site, you agree not to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Use the Site for any unlawful purpose or in violation of any applicable laws</li>
                <li>Attempt to gain unauthorized access to any portion of the Site or any systems or networks</li>
                <li>Interfere with or disrupt the operation of the Site</li>
                <li>Submit false or misleading information</li>
                <li>Use automated systems (bots, scrapers) to access the Site without permission</li>
              </ul>
            </section>

            {/* Intellectual Property */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">8. Intellectual Property</h2>
              <p className="text-gray-700 leading-relaxed">
                All content on this Site, including text, graphics, logos, images, and software, is the property of Trishikha Organics or its content suppliers and is protected by Indian and international copyright laws. You may not reproduce, distribute, modify, or create derivative works from any content without our prior written consent.
              </p>
            </section>

            {/* Disclaimer of Warranties */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">9. Disclaimer of Warranties</h2>
              <p className="text-gray-700 leading-relaxed">
                THE SITE AND PRODUCTS ARE PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SITE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
              </p>
            </section>

            {/* Limitation of Liability */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">10. Limitation of Liability</h2>
              <p className="text-gray-700 leading-relaxed">
                TO THE FULLEST EXTENT PERMITTED BY LAW, TRISHIKHA ORGANICS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE SITE OR PURCHASE OF PRODUCTS. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY YOU FOR THE PRODUCT GIVING RISE TO THE CLAIM.
              </p>
            </section>

            {/* Indemnification */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">11. Indemnification</h2>
              <p className="text-gray-700 leading-relaxed">
                You agree to indemnify, defend, and hold harmless Trishikha Organics and its officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including legal fees) arising out of your use of the Site, violation of these Terms, or infringement of any third-party rights.
              </p>
            </section>

            {/* Governing Law */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">12. Governing Law</h2>
              <p className="text-gray-700 leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising from these Terms or your use of the Site shall be subject to the exclusive jurisdiction of the courts in Gandhi Nagar, Gujarat.
              </p>
            </section>

            {/* Changes to Terms */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">13. Changes to Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting to the Site. Your continued use of the Site after any changes constitutes your acceptance of the revised Terms.
              </p>
            </section>

            {/* Contact Us */}
            <section className="bg-white rounded-xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4">14. Contact Us</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                If you have any questions about these Terms of Service, please contact us:
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
