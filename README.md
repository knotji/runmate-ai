# RunMate AI

RunMate AI, Thai display name "โค้ชข้างทาง", is a mobile-first AI running coach MVP. The app helps a runner upload daily sleep screenshots, meal photos, and running result screenshots, then uses OpenAI to extract structured data and give practical Thai coaching.

This is not a medical app. It gives general training, nutrition, and recovery guidance only.

## Tech stack

- Next.js App Router, TypeScript, Tailwind CSS
- Supabase Auth, Postgres, and Storage
- OpenAI API for image understanding, structured extraction, plans, summaries, and coach chat
- MVP local demo flow with `localStorage` when Supabase is not configured

## Environment variables

Copy `.env.example` to `.env.local` and fill values:

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_VERSION=0.1.0
NEXT_PUBLIC_GIT_SHA=local
NEXT_PUBLIC_BUILD_TIME=
NEXT_PUBLIC_DEPLOY_ENV=local
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
CRON_SECRET=
GOOGLE_HEALTH_CLIENT_ID=
GOOGLE_HEALTH_CLIENT_SECRET=
GOOGLE_HEALTH_REDIRECT_URI=http://localhost:3000/api/google-health/callback
```

Set `AI_PROVIDER=gemini` to use Gemini first, or `AI_PROVIDER=openai` to use OpenAI first. Never expose `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` in client components.
The `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_GIT_SHA`, `NEXT_PUBLIC_BUILD_TIME`, and `NEXT_PUBLIC_DEPLOY_ENV` values are safe public build metadata shown on the Settings page. On Vercel, `NEXT_PUBLIC_GIT_SHA` and `NEXT_PUBLIC_DEPLOY_ENV` can fall back to `VERCEL_GIT_COMMIT_SHA` and `VERCEL_ENV` at build time.

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` are the Web Push keypair (generate once with `npx web-push generate-vapid-keys`) that power the daily reminder notification in Settings. `CRON_SECRET` protects `/api/push/send-daily-reminders` and `/api/google-health/sync`, the two endpoints `vercel.json`'s cron jobs hit once a day — set the same value in Vercel's project settings under the Cron Jobs / Environment Variables section (Vercel sends it automatically as a bearer token when calling scheduled functions).

`GOOGLE_HEALTH_CLIENT_ID` / `GOOGLE_HEALTH_CLIENT_SECRET` come from a Google Cloud project at [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) — enable the Google Health API, create an OAuth 2.0 Client ID with Application type **Web application**, and set `GOOGLE_HEALTH_REDIRECT_URI` as an authorized redirect URI (must match exactly, including protocol and trailing path — update both when the deployed domain changes). While the project's OAuth consent screen is in "Testing" mode, add each user's Google account email under Test users or they won't be able to complete the connect flow. This powers Settings > ข้อมูล > "เชื่อมต่อ Google Health", which auto-imports sleep and workout logs daily instead of requiring a screenshot upload — this is the modern replacement for the (now-deprecated, shutting down September 2026) Fitbit Web API. It reads whatever devices/apps are connected to the user's Google Health account (Fitbit, Pixel Watch, and other third-party integrations Google documents); whether a device that only syncs through the separate, also-being-deprecated Google Fit API/app (e.g. some Samsung Health configurations) surfaces here too is unconfirmed — verify with a real connected account rather than assuming.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_runmate_ai_mvp.sql` in the SQL editor or through the Supabase CLI.
3. Confirm these storage buckets exist:
   - `sleep-images`
   - `meal-images`
   - `run-images`
4. Add your Supabase URL and anon key to `.env.local`.

The migration creates the MVP tables, enables RLS, and adds owner-only row policies.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## MVP pages

- `/` Today dashboard
- `/onboarding` profile setup
- `/race-goal` create and view race goal
- `/upload` upload sleep, meal, or run image
- `/upload` supports sleep screenshots, meal photos, workout screenshots, and body composition screenshots
- `/logs` local log viewer
- `/summary` daily summary
- `/coach` coach chat
- `/settings` basic settings

## AI fallback behavior

If the selected AI provider key is missing or the provider fails, API routes return safe Thai fallback coaching instead of crashing. Uploaded images are attempted through Supabase Storage when Supabase is configured; otherwise the MVP still works from image data URLs.

## Safety disclaimer

คำแนะนำในแอพนี้เป็นแนวทางทั่วไปด้านการซ้อม โภชนาการ และการฟื้นตัว ไม่ใช่คำแนะนำทางการแพทย์ หากมีอาการเจ็บรุนแรง เจ็บต่อเนื่อง หน้ามืด แน่นหน้าอก หรืออาการผิดปกติ ควรหยุดออกกำลังกายและปรึกษาผู้เชี่ยวชาญ
