import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { buildGoogleHealthAuthorizeUrl, GOOGLE_HEALTH_OAUTH_STATE_COOKIE } from "@/lib/googleHealth/oauth";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/settings?tab=data&ghealth_error=1", origin));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const state = randomBytes(16).toString("hex");
  const authorizeUrl = buildGoogleHealthAuthorizeUrl(state);
  if (!authorizeUrl) {
    return NextResponse.redirect(new URL("/settings?tab=data&ghealth_error=not-configured", origin));
  }

  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_HEALTH_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes — plenty for the OAuth round trip
    path: "/",
  });

  return NextResponse.redirect(authorizeUrl);
}
