# Google Sign-In Setup - RunMate AI

This guide explains the external setup needed for the "เข้าสู่ระบบด้วย Google" button. Do not commit Google Client IDs, Client Secrets, or Supabase secrets to the repository.

## 1. Google Cloud OAuth Client

1. Open [Google Cloud Console](https://console.cloud.google.com) and go to **APIs & Services > Credentials**.
2. Create an **OAuth 2.0 Client ID**.
3. Set **Application type** to **Web application**.
4. Add these **Authorized JavaScript origins**:
   - `https://runmate-ai-beige.vercel.app`
   - `http://localhost:3000` for local development, if needed
5. Add this **Authorized redirect URI**:
   - `https://<project-ref>.supabase.co/auth/v1/callback`

Use the exact Supabase callback URL shown in **Supabase Dashboard > Authentication > Providers > Google**.

## 2. Supabase Google Provider

1. Open **Supabase Dashboard > Authentication > Providers > Google**.
2. Enable Google.
3. Paste the Google OAuth **Client ID** and **Client Secret**.
4. Save the provider settings.

## 3. Supabase URL Configuration

Open **Supabase Dashboard > Authentication > URL Configuration**.

Set **Site URL**:

```text
https://runmate-ai-beige.vercel.app
```

Add **Redirect URLs**:

```text
https://runmate-ai-beige.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

## 4. App Environment

Google credentials stay in Supabase. The app only needs the existing public Supabase variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## 5. Flow

```text
User clicks "เข้าสู่ระบบด้วย Google"
  -> Supabase starts OAuth with provider=google
  -> Google redirects back to Supabase
  -> Supabase redirects to /auth/callback?code=<code>
  -> src/app/auth/callback/route.ts exchanges the code for a session
  -> User lands on the safe relative next path or /
```

Automated tests mock the Supabase browser auth client. They do not use real Google OAuth, real Supabase OAuth, or external navigation.
