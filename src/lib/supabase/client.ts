import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

declare global {
  interface Window {
    __RUNMATE_SUPABASE_AUTH_MOCK__?: SupabaseClient;
  }
}

let didLogEnv = false;

export function createClient(): SupabaseClient | null {
  if (
    typeof window !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    window.__RUNMATE_SUPABASE_AUTH_MOCK__
  ) {
    return window.__RUNMATE_SUPABASE_AUTH_MOCK__;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!didLogEnv && typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    didLogEnv = true;
    console.info("[supabase-client-env]", {
      hasUrl: Boolean(url),
      hasAnonKey: Boolean(anonKey),
      supabaseUrl: process.env.NODE_ENV === "development" ? url ?? null : undefined,
      origin: window.location.origin,
    });
  }

  if (!url || !anonKey) return null;
  return createBrowserClient(url, anonKey);
}
