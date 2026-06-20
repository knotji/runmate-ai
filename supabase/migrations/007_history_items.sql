create table if not exists public.history_items (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  created_at timestamptz not null,
  data jsonb not null,
  primary key (user_id, id)
);

alter table public.history_items enable row level security;

create policy "own history items" on public.history_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
