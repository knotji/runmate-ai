-- Add metadata column to coach_messages if it does not exist
alter table public.coach_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Add check constraint for role if not already restricted
alter table public.coach_messages
  drop constraint if exists coach_messages_role_check;

alter table public.coach_messages
  add constraint coach_messages_role_check check (role in ('user', 'assistant'));

-- Index for user_id + created_at desc for lightweight queries
create index if not exists coach_messages_user_created_idx
  on public.coach_messages (user_id, created_at desc);

-- Recreate individual select/insert/delete RLS policies
drop policy if exists "own coach messages" on public.coach_messages;
drop policy if exists "Users can read own coach messages" on public.coach_messages;
drop policy if exists "Users can insert own coach messages" on public.coach_messages;
drop policy if exists "Users can delete own coach messages" on public.coach_messages;

create policy "Users can read own coach messages"
  on public.coach_messages
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own coach messages"
  on public.coach_messages
  for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own coach messages"
  on public.coach_messages
  for delete
  using (auth.uid() = user_id);
