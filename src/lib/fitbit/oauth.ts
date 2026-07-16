export const FITBIT_OAUTH_STATE_COOKIE = "fitbit_oauth_state";

const AUTHORIZE_URL = "https://www.fitbit.com/oauth2/authorize";
const TOKEN_URL = "https://api.fitbit.com/oauth2/token";
const REVOKE_URL = "https://api.fitbit.com/oauth2/revoke";

// sleep: sleep logs. activity: workout/activity logs, steps, calories.
// heartrate: resting HR + HR during activity/sleep. profile: Fitbit user id.
const SCOPES = ["sleep", "activity", "heartrate", "profile"].join(" ");

function getCredentials() {
  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  const redirectUri = process.env.FITBIT_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function buildFitbitAuthorizeUrl(state: string): string | null {
  const creds = getCredentials();
  if (!creds) return null;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    scope: SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type FitbitTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO timestamp
  fitbitUserId: string;
};

function authHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export async function exchangeFitbitCode(code: string): Promise<FitbitTokens | null> {
  const creds = getCredentials();
  if (!creds) return null;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader(creds.clientId, creds.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: creds.clientId,
      grant_type: "authorization_code",
      redirect_uri: creds.redirectUri,
      code,
    }),
  });

  if (!response.ok) return null;
  const json = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    fitbitUserId: json.user_id,
  };
}

export async function refreshFitbitToken(refreshToken: string): Promise<FitbitTokens | null> {
  const creds = getCredentials();
  if (!creds) return null;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader(creds.clientId, creds.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) return null;
  const json = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    fitbitUserId: json.user_id,
  };
}

export async function revokeFitbitToken(accessToken: string): Promise<void> {
  const creds = getCredentials();
  if (!creds) return;

  await fetch(REVOKE_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader(creds.clientId, creds.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token: accessToken }),
  }).catch(() => { /* best-effort — the connection row is deleted regardless */ });
}
