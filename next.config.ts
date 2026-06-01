import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "kuroshiro",
    "kuroshiro-analyzer-kuromoji",
    "kuromoji"
  ]
};

export default nextConfig;
