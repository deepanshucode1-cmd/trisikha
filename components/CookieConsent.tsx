"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const COOKIE_CONSENT_KEY = "cookie_consent";
const COOKIE_PREFERENCES_KEY = "cookie_preferences";

interface CookiePreferences {
  necessary: boolean; // Always true, can't be disabled
  analytics: boolean;
  marketing: boolean;
}

const defaultPreferences: CookiePreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
};

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(defaultPreferences);

  useEffect(() => {
    // Check if user has already consented
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      setShowBanner(true);
    } else {
      // Load saved preferences
      const savedPrefs = localStorage.getItem(COOKIE_PREFERENCES_KEY);
      if (savedPrefs) {
        try {
          setPreferences(JSON.parse(savedPrefs));
        } catch {
          // Invalid preferences, use defaults
        }
      }
    }
  }, []);

  const saveConsent = useCallback((prefs: CookiePreferences) => {
    localStorage.setItem(COOKIE_CONSENT_KEY, new Date().toISOString());
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(prefs));
    setPreferences(prefs);
    setShowBanner(false);
    setShowPreferences(false);
  }, []);

  const acceptAll = useCallback(() => {
    saveConsent({
      necessary: true,
      analytics: true,
      marketing: true,
    });
  }, [saveConsent]);

  const rejectAll = useCallback(() => {
    saveConsent({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  }, [saveConsent]);

  const savePreferences = useCallback(() => {
    saveConsent(preferences);
  }, [preferences, saveConsent]);

  if (!showBanner) {
    return null;
  }

  return (
    <>
      {/* Main Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          {!showPreferences ? (
            // Simple consent view
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm text-gray-700">
                  We use cookies to enhance your browsing experience and analyze site traffic.
                  By clicking &quot;Accept All&quot;, you consent to our use of cookies.
                  Read our{" "}
                  <Link href="/privacy-policy" className="text-[#4a7c59] underline hover:text-[#3d6549]">
                    Privacy Policy
                  </Link>{" "}
                  for more information.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  onClick={() => setShowPreferences(true)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Manage Preferences
                </button>
                <button
                  onClick={rejectAll}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Reject All
                </button>
                <button
                  onClick={acceptAll}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#4a7c59] rounded-md hover:bg-[#3d6549] transition-colors"
                >
                  Accept All
                </button>
              </div>
            </div>
          ) : (
            // Preferences view
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Cookie Preferences</h3>
                <button
                  onClick={() => setShowPreferences(false)}
                  className="text-gray-500 hover:text-gray-700"
                  aria-label="Close preferences"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-3">
                {/* Necessary cookies - always enabled */}
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Necessary Cookies</h4>
                    <p className="text-xs text-gray-500">Required for the website to function properly</p>
                  </div>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className="sr-only"
                    />
                    <div className="w-10 h-5 bg-[#4a7c59] rounded-full opacity-60 cursor-not-allowed">
                      <div className="absolute w-4 h-4 bg-white rounded-full shadow top-0.5 right-0.5"></div>
                    </div>
                  </div>
                </div>

                {/* Analytics cookies */}
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Analytics Cookies</h4>
                    <p className="text-xs text-gray-500">Help us understand how visitors use our site</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreferences(p => ({ ...p, analytics: !p.analytics }))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      preferences.analytics ? "bg-[#4a7c59]" : "bg-gray-300"
                    }`}
                    role="switch"
                    aria-checked={preferences.analytics}
                  >
                    <span
                      className={`absolute w-4 h-4 bg-white rounded-full shadow top-0.5 transition-transform ${
                        preferences.analytics ? "right-0.5" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>

                {/* Marketing cookies */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Marketing Cookies</h4>
                    <p className="text-xs text-gray-500">Used to deliver personalized advertisements</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreferences(p => ({ ...p, marketing: !p.marketing }))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      preferences.marketing ? "bg-[#4a7c59]" : "bg-gray-300"
                    }`}
                    role="switch"
                    aria-checked={preferences.marketing}
                  >
                    <span
                      className={`absolute w-4 h-4 bg-white rounded-full shadow top-0.5 transition-transform ${
                        preferences.marketing ? "right-0.5" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={rejectAll}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Reject All
                </button>
                <button
                  onClick={savePreferences}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#4a7c59] rounded-md hover:bg-[#3d6549] transition-colors"
                >
                  Save Preferences
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Hook to check cookie preferences
 */
export function useCookiePreferences(): CookiePreferences {
  const [preferences, setPreferences] = useState<CookiePreferences>(defaultPreferences);

  useEffect(() => {
    const savedPrefs = localStorage.getItem(COOKIE_PREFERENCES_KEY);
    if (savedPrefs) {
      try {
        setPreferences(JSON.parse(savedPrefs));
      } catch {
        // Invalid preferences, use defaults
      }
    }
  }, []);

  return preferences;
}

export default CookieConsent;
