import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

let didLogEnv = false;

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!didLogEnv) {
    didLogEnv = true;
    console.info("[supabase-server-env]", {
      hasUrl: Boolean(url),
      hasAnonKey: Boolean(anonKey),
      hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
      supabaseUrl: process.env.NODE_ENV === "development" ? url ?? null : undefined,
      vercelEnv: process.env.VERCEL_ENV ?? null,
    });
  }

  if (!url || !anonKey) return null;

  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}
