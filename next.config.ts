import type { NextConfig } from "next";
import { readFileSync } from "fs";

// Read version from package.json at build time so the Settings page always
// shows the correct version string without requiring a Vercel env var.
const pkgVersion = (JSON.parse(readFileSync("./package.json", "utf8")) as { version: string }).version;

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  env: {
    NEXT_PUBLIC_GIT_SHA: process.env.NEXT_PUBLIC_GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV ?? process.env.VERCEL_ENV ?? "",
    // Injected at build time so client bundle always carries version + timestamp.
    // A manually-set env var (Vercel or .env.local) takes precedence via ??.
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION ?? pkgVersion,
    NEXT_PUBLIC_BUILD_TIME: process.env.NEXT_PUBLIC_BUILD_TIME ?? new Date().toISOString(),
  },
};

export default nextConfig;
