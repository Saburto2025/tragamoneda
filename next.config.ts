import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Vercel manages output natively — do NOT set output:"standalone" */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
