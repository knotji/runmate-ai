-- Web Push subscriptions, one row per browser/device the user has enabled
-- notifications on. endpoint is the natural dedupe key per user (re-subscribing
-- the same browser upserts the same row instead of creating duplicates).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  last_sent_date_key text null, -- Bangkok dateKey (YYYY-MM-DD) of the last reminder sent, to avoid double-sends
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The daily reminder cron job runs with the service-role key (bypasses RLS by
-- design, since it must read across all users) — no additional policy needed
-- for that path.
