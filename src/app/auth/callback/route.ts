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
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
      }
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth", requestUrl.origin));
}
