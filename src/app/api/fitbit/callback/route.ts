import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeFitbitCode, FITBIT_OAUTH_STATE_COOKIE } from "@/lib/fitbit/oauth";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(FITBIT_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(FITBIT_OAUTH_STATE_COOKIE);

  if (oauthError) {
    // e.g. "access_denied" — user declined on Fitbit's consent screen
    return NextResponse.redirect(new URL("/settings?tab=data&fitbit_error=denied", origin));
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/settings?tab=data&fitbit_error=invalid-state", origin));
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/settings?tab=data&fitbit_error=1", origin));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const tokens = await exchangeFitbitCode(code);
  if (!tokens) {
    return NextResponse.redirect(new URL("/settings?tab=data&fitbit_error=exchange-failed", origin));
  }

  const { error } = await supabase.from("fitbit_connections").upsert({
    user_id: user.id,
    fitbit_user_id: tokens.fitbitUserId,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: tokens.expiresAt,
    last_sync_error: null,
  });

  if (error) {
    return NextResponse.redirect(new URL("/settings?tab=data&fitbit_error=save-failed", origin));
  }

  return NextResponse.redirect(new URL("/settings?tab=data&fitbit_connected=1", origin));
}
