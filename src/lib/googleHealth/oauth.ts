// Standard Google OAuth 2.0 — the Google Health API (health.googleapis.com)
// uses Google's own OAuth stack, not a provider-specific one (unlike the
// classic Fitbit Web API it replaces). Endpoints below are Google's stable,
// documented OAuth2 endpoints, shared across all Google APIs.

export const GOOGLE_HEALTH_OAUTH_STATE_COOKIE = "google_health_oauth_state";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

// Scopes map to the Google Health API's data-type categories:
// - sleep -> "sleep" category
// - exercise, steps, distance -> "activity_and_fitness" category
// - daily resting HR / HRV -> "health_metrics_and_measurements" category
const SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "openid",
].join(" ");

function getCredentials() {
  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_HEALTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleHealthAuthorizeUrl(state: string): string | null {
  const creds = getCredentials();
  if (!creds) return null;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    scope: SCOPES,
    state,
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // force the consent screen so a refresh_token is issued even on re-connect
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type GoogleHealthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO timestamp
};

export async function exchangeGoogleHealthCode(code: string): Promise<GoogleHealthTokens | null> {
  const creds = getCredentials();
  if (!creds) return null;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: creds.redirectUri,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!response.ok) return null;
  const json = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  if (!json.refresh_token) return null; // access_type=offline + prompt=consent should always return one

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}

export async function refreshGoogleHealthToken(refreshToken: string): Promise<Omit<GoogleHealthTokens, "refreshToken"> | null> {
  const creds = getCredentials();
  if (!creds) return null;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) return null;
  const json = await response.json() as { access_token: string; expires_in: number };
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}

export async function revokeGoogleHealthToken(accessToken: string): Promise<void> {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(accessToken)}`, { method: "POST" })
    .catch(() => { /* best-effort — the connection row is deleted regardless */ });
}

/** The "sub" claim identifies the connected Google account. */
export async function fetchGoogleUserSub(accessToken: string): Promise<string | null> {
  const response = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return null;
  const json = await response.json() as { sub: string };
  return json.sub;
}
