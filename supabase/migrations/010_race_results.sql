create table if not exists public.race_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  race_goal_id uuid references public.race_goals(id) on delete set null,
  linked_history_item_id text null,
  race_name text,
  race_date date,
  race_distance text,
  goal_type text,
  target_time text null,
  actual_distance_km numeric null,
  actual_time text null,
  actual_pace text null,
  avg_hr numeric null,
  max_hr numeric null,
  cadence numeric null,
  calories numeric null,
  elevation_m numeric null,
  result_status text default 'completed',
  goal_result text null,
  coach_summary text null,
  reflection text null,
  raw_workout_data jsonb null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.race_results enable row level security;

drop policy if exists "own race results" on public.race_results;
create policy "own race results" on public.race_results
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.race_results to authenticated;
