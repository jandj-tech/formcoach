import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 'standalone' emits a self-contained .next/standalone/server.js that Phusion
  // Passenger runs directly (cPanel Application Manager). No-op on Vercel.
  output: "standalone",
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
