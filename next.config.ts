import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  env: {
    NEXT_PUBLIC_GIT_SHA: process.env.NEXT_PUBLIC_GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV ?? process.env.VERCEL_ENV ?? "",
  },
};

export default nextConfig;
