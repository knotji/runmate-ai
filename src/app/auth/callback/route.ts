import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Only allow relative paths starting with "/" and reject protocol-relative or absolute URLs. */
export function isSafeRedirect(path: string): boolean {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes(":")
  );
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";
  const safeNext = isSafeRedirect(next) ? next : "/";

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        // First-time users (no profiles row yet) land on the onboarding form instead of
        // the Today page with an empty profile — unless the caller explicitly asked for
        // a specific destination via ?next=.
        const userId = data.session?.user.id;
        if (userId && !requestUrl.searchParams.get("next")) {
          const { data: profileRow } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", userId)
            .maybeSingle();
          if (!profileRow) {
            return NextResponse.redirect(new URL("/onboarding", requestUrl.origin));
          }
        }
        return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
      }
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth", requestUrl.origin));
}
