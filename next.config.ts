import type { NextConfig } from "next";

// Only HSTS was present in production (added by Vercel). Everything else the
// browser could enforce for us was missing, so clickjacking and MIME-sniffing
// had nothing standing in the way. Content-Security-Policy is deliberately
// absent for now: the app inlines JSON-LD and loads the Meta pixel, so a policy
// tight enough to be worth having needs to be measured in report-only mode
// first rather than guessed at here.
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
  // 'standalone' emits a self-contained .next/standalone/server.js that Phusion
  // Passenger runs directly (cPanel Application Manager). No-op on Vercel.
  output: "standalone",
  // No experimental.viewTransition flag: next 16.3 rejects it as an invalid key
  // ("Invalid next.config.ts options detected"). <ViewTransition> in
  // app/layout.tsx renders correctly without it on react 19.2 — verified against
  // a production build serving the page-fade transition.
};

export default nextConfig;
