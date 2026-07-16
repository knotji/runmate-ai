-- One Fitbit OAuth connection per user. Tokens are only ever read/written from
-- server-side routes (never selected directly by client code) even though RLS
-- scopes rows to their owner the same way every other table in this app does.
create table if not exists public.fitbit_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fitbit_user_id text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz null,
  last_sync_error text null
);

alter table public.fitbit_connections enable row level security;

create policy "own fitbit connection" on public.fitbit_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The daily sync cron job runs with the service-role key (bypasses RLS by
-- design, since it must read/refresh tokens across all users).
