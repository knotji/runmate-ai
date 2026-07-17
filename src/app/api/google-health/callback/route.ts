import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeGoogleHealthCode, fetchGoogleUserSub, GOOGLE_HEALTH_OAUTH_STATE_COOKIE } from "@/lib/googleHealth/oauth";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GOOGLE_HEALTH_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(GOOGLE_HEALTH_OAUTH_STATE_COOKIE);

  if (oauthError) {
    // e.g. "access_denied" — user declined on Google's consent screen
    return NextResponse.redirect(new URL("/settings?tab=data&ghealth_error=denied", origin));
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/settings?tab=data&ghealth_error=invalid-state", origin));
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/settings?tab=data&ghealth_error=1", origin));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const tokens = await exchangeGoogleHealthCode(code);
  if (!tokens) {
    return NextResponse.redirect(new URL("/settings?tab=data&ghealth_error=exchange-failed", origin));
  }

  const sub = await fetchGoogleUserSub(tokens.accessToken);
  if (!sub) {
    return NextResponse.redirect(new URL("/settings?tab=data&ghealth_error=exchange-failed", origin));
  }

  const { error } = await supabase.from("google_health_connections").upsert({
    user_id: user.id,
    google_sub: sub,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: tokens.expiresAt,
    last_sync_error: null,
  });

  if (error) {
    return NextResponse.redirect(new URL("/settings?tab=data&ghealth_error=save-failed", origin));
  }

  return NextResponse.redirect(new URL("/settings?tab=data&ghealth_connected=1", origin));
}
