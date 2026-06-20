# Vercel + Supabase Debug Checklist

## Environment variables

Set the same values in Vercel Project Settings > Environment Variables as local `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Use `/api/debug/env` to verify whether each variable exists at runtime. The endpoint never returns secret values. In development only, it also returns the public Supabase URL so localhost and Vercel project mismatch can be checked.

## Supabase Auth URL configuration

Supabase Dashboard > Authentication > URL Configuration must include:

- `https://YOUR_DOMAIN.vercel.app/**`
- `http://localhost:3000/**`

If these redirect URLs are missing, login can appear successful in one domain while the app has no valid session in another domain.
