import { NextResponse } from "next/server";

function exists(value: string | undefined) {
  return Boolean(value && value.trim());
}

export function GET() {
  const isDevelopment = process.env.NODE_ENV === "development";
  if (!isDevelopment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Never return secret values from this endpoint. It is intentionally limited
  // to existence flags so Vercel runtime config can be checked safely.
  return NextResponse.json({
    runtime: {
      nodeEnv: process.env.NODE_ENV,
      vercel: exists(process.env.VERCEL),
      vercelEnv: process.env.VERCEL_ENV ?? null,
    },
    env: {
      NEXT_PUBLIC_SUPABASE_URL: {
        exists: exists(process.env.NEXT_PUBLIC_SUPABASE_URL),
        value: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
      },
      NEXT_PUBLIC_SUPABASE_ANON_KEY: {
        exists: exists(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      },
      SUPABASE_SERVICE_ROLE_KEY: {
        exists: exists(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      OPENAI_API_KEY: {
        exists: exists(process.env.OPENAI_API_KEY),
      },
    },
  });
}
