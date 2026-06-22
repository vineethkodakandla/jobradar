import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Python scraper + supabase + workflow dirs are not part of the Next build.
  // (Also enforced via .vercelignore so Vercel never uploads them.)
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
