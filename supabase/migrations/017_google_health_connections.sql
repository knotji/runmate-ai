-- One Google Health API OAuth connection per user. Tokens are only ever
-- read/written from server-side routes (never selected directly by client
-- code) even though RLS scopes rows to their owner the same way every other
-- table in this app does.
--
-- Supersedes the short-lived "fitbit_connections" design (never applied to
-- any environment) once we learned mid-implementation that the classic
-- Fitbit Web API is being shut down in September 2026 in favor of the
-- Google Health API (health.googleapis.com) — a different OAuth provider
-- (standard Google OAuth 2.0) and a different REST surface entirely.
create table if not exists public.google_health_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_sub text not null, -- the "sub" claim from the connected Google account
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz null,
  last_sync_error text null
);

alter table public.google_health_connections enable row level security;

create policy "own google health connection" on public.google_health_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The daily sync cron job runs with the service-role key (bypasses RLS by
-- design, since it must read/refresh tokens across all users).
