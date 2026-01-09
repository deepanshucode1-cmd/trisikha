import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externalize pdfkit and its dependencies to prevent bundling issues
  serverExternalPackages: ["pdfkit", "fontkit", "linebreak", "png-js"],

  images: {
    remotePatterns: [new URL("https://rapucromhfolvhcbgcuf.supabase.co/**")]
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on"
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload"
          },
          {
            key: "X-Frame-Options",
            value: "DENY"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block"
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://api.razorpay.com",
              // UPDATE THIS LINE BELOW:
              "frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com", 
              "frame-ancestors 'none'",
            ].join("; ")
          }
        ]
      }
    ];
  }
};

export default nextConfig;
