"use client";

import { useState } from "react";
import Link from "next/link";

const content = {
  en: {
    summary:
      "We collect your name, email, phone, and address to fulfill your order. Data stored with Supabase and shared with Razorpay (payment) & Shiprocket (shipping).",
    viewDetails: "View full details",
    hideDetails: "Hide details",
    title: "Data Collection Notice",
    intro:
      "By placing this order, Trishikha Organics will collect and process the following personal data for order fulfillment under Section 7 of the DPDP Act 2023 (legitimate use):",
    dataHeading: "Data We Collect",
    dataItems: [
      "Name, email, phone number — for order processing and communication",
      "Shipping and billing address — for delivery and invoicing",
      "Payment information — processed by Razorpay (we do not store card details)",
    ],
    usageHeading: "How Your Data Is Used",
    usageItems: [
      "Processed solely to fulfill your order",
      "Stored securely with Supabase (database hosting)",
      "Shared with Shiprocket for shipping and Razorpay for payment",
      "Retained for 8 years for tax compliance (Income Tax Act)",
    ],
    rightsHeading: "Your Rights (DPDP Act 2023)",
    rightsIntro: "You have the right to:",
    rightsItems: [
      "Access your personal data",
      "Correct inaccurate data",
      "Request erasure of your data (subject to legal retention requirements)",
      "File a grievance with our Grievance Officer",
      "Complain to the Data Protection Board of India",
      "Nominate another person to exercise these rights on your behalf",
    ],
    exerciseRights: "Exercise your rights at:",
    grievanceHeading: "Grievance Officer",
    grievanceOrg: "Trishikha Organics",
    grievanceResponse: "Response within 90 days (DPDP Rule 14(3))",
    privacyPolicy: "Privacy Policy",
    myData: "My Data",
  },
  hi: {
    summary:
      "हम आपका नाम, ईमेल, फ़ोन और पता आपके ऑर्डर को पूरा करने के लिए एकत्र करते हैं। डेटा Supabase में संग्रहीत और Razorpay (भुगतान) व Shiprocket (शिपिंग) के साथ साझा किया जाता है।",
    viewDetails: "पूरा विवरण देखें",
    hideDetails: "विवरण छिपाएँ",
    title: "डेटा संग्रहण सूचना",
    intro:
      "यह ऑर्डर देकर, तृषिखा ऑर्गेनिक्स DPDP अधिनियम 2023 की धारा 7 (वैध उपयोग) के तहत ऑर्डर पूर्ति के लिए निम्नलिखित व्यक्तिगत डेटा एकत्र और संसाधित करेगा:",
    dataHeading: "हम कौन सा डेटा एकत्र करते हैं",
    dataItems: [
      "नाम, ईमेल, फ़ोन नंबर — ऑर्डर प्रोसेसिंग और संचार के लिए",
      "शिपिंग और बिलिंग पता — डिलीवरी और चालान के लिए",
      "भुगतान जानकारी — Razorpay द्वारा संसाधित (हम कार्ड विवरण संग्रहीत नहीं करते)",
    ],
    usageHeading: "आपके डेटा का उपयोग कैसे होता है",
    usageItems: [
      "केवल आपके ऑर्डर को पूरा करने के लिए संसाधित किया जाता है",
      "Supabase में सुरक्षित रूप से संग्रहीत (डेटाबेस होस्टिंग)",
      "शिपिंग के लिए Shiprocket और भुगतान के लिए Razorpay के साथ साझा किया जाता है",
      "कर अनुपालन (आयकर अधिनियम) के लिए 8 वर्षों तक रखा जाता है",
    ],
    rightsHeading: "आपके अधिकार (DPDP अधिनियम 2023)",
    rightsIntro: "आपको निम्नलिखित अधिकार हैं:",
    rightsItems: [
      "अपने व्यक्तिगत डेटा तक पहुँचें",
      "गलत डेटा को सही करें",
      "अपने डेटा को मिटाने का अनुरोध करें (कानूनी प्रतिधारण आवश्यकताओं के अधीन)",
      "हमारे शिकायत अधिकारी के पास शिकायत दर्ज करें",
      "भारतीय डेटा संरक्षण बोर्ड से शिकायत करें",
      "अपनी ओर से इन अधिकारों का प्रयोग करने के लिए किसी अन्य व्यक्ति को नामित करें",
    ],
    exerciseRights: "अपने अधिकारों का प्रयोग करें:",
    grievanceHeading: "शिकायत अधिकारी",
    grievanceOrg: "तृषिखा ऑर्गेनिक्स",
    grievanceResponse: "90 दिनों के भीतर प्रतिक्रिया (DPDP नियम 14(3))",
    privacyPolicy: "गोपनीयता नीति",
    myData: "मेरा डेटा",
  },
};

type Lang = keyof typeof content;

export default function DataCollectionNotice() {
  const [expanded, setExpanded] = useState(false);
  const [lang, setLang] = useState<Lang>("en");

  const t = content[lang];

  return (
    <div className="mt-4 border border-gray-200 rounded-lg bg-gray-50 text-sm">
      {/* Layer 1 — Always visible summary */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 text-gray-600 min-w-0">
            <svg
              className="w-4 h-4 mt-0.5 shrink-0 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="leading-snug">{t.summary}</p>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === "en" ? "hi" : "en")}
            className="shrink-0 text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 transition-colors"
          >
            {lang === "en" ? "हिंदी" : "EN"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-[#3d3c30] hover:underline flex items-center gap-1"
        >
          {expanded ? t.hideDetails : t.viewDetails}
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {/* Layer 2 — Expandable full notice */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-200 space-y-4 text-gray-600">
          <div>
            <h4 className="font-semibold text-gray-800 text-sm">{t.title}</h4>
            <p className="mt-1 leading-snug">{t.intro}</p>
          </div>

          <div>
            <h5 className="font-medium text-gray-700 text-xs uppercase tracking-wide">
              {t.dataHeading}
            </h5>
            <ul className="mt-1 space-y-1">
              {t.dataItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                  <span className="leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h5 className="font-medium text-gray-700 text-xs uppercase tracking-wide">
              {t.usageHeading}
            </h5>
            <ul className="mt-1 space-y-1">
              {t.usageItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                  <span className="leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h5 className="font-medium text-gray-700 text-xs uppercase tracking-wide">
              {t.rightsHeading}
            </h5>
            <p className="mt-1">{t.rightsIntro}</p>
            <ul className="mt-1 space-y-1">
              {t.rightsItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                  <span className="leading-snug">{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2">
              {t.exerciseRights}{" "}
              <Link
                href="/my-data"
                className="text-[#3d3c30] hover:underline font-medium"
              >
                /my-data
              </Link>
            </p>
          </div>

          <div className="bg-white rounded-md p-3 border border-gray-200">
            <h5 className="font-medium text-gray-700 text-xs uppercase tracking-wide">
              {t.grievanceHeading}
            </h5>
            <p className="mt-1 font-medium text-gray-800">{t.grievanceOrg}</p>
            <p className="mt-0.5">
              <a
                href="mailto:trishikhaorganic@gmail.com"
                className="text-[#3d3c30] hover:underline"
              >
                trishikhaorganic@gmail.com
              </a>{" "}
              |{" "}
              <a
                href="tel:+917984130253"
                className="text-[#3d3c30] hover:underline"
              >
                +91 79841 30253
              </a>
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {t.grievanceResponse}
            </p>
          </div>

          {/* Layer 3 — Links */}
          <div className="flex flex-wrap gap-3 text-xs pt-1">
            <Link
              href="/privacy-policy"
              className="text-[#3d3c30] hover:underline"
            >
              {t.privacyPolicy}
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/my-data" className="text-[#3d3c30] hover:underline">
              {t.myData}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
