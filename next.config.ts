import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryBasePath = "/Vocal-sheet-music";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BASE_PATH: isGitHubPages ? repositoryBasePath : ""
  },
  ...(isGitHubPages
    ? {
        output: "export" as const,
        basePath: repositoryBasePath,
        assetPrefix: repositoryBasePath,
        trailingSlash: true,
        images: {
          unoptimized: true
        }
      }
    : {}),
  serverExternalPackages: [
    "kuroshiro",
    "kuroshiro-analyzer-kuromoji",
    "kuromoji"
  ]
};

export default nextConfig;
