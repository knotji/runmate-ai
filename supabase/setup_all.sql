-- ============================================================
-- RunMate AI — Full database setup (run this once in Supabase)
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Tables ──────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  height_cm numeric null,
  weight_kg numeric null,
  current_level text null,
  current_longest_run_km numeric null,
  easy_pace text null,
  easy_hr_cap text null,
  max_hr integer null,
  weekly_training_days integer null,
  preferred_long_run_day text null,
  injury_notes text null,
  main_goal text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- 003
  age integer null,
  gender text null,
  tempo_pace text null,
  race_pace text null,
  available_training_days text null,
  usual_run_time text null,
  gear_notes text null,
  shoe_rotation text null,
  watch_device text null,
  treadmill_access boolean null,
  training_constraints text null,
  secondary_goal text null,
  coach_tone text null,
  nutrition_notes text null,
  sleep_notes text null,
  -- 005
  birth_year integer null,
  timezone text null,
  work_schedule text null,
  target_distance text null,
  goal_priority text null,
  target_race_date date null,
  target_time text null,
  weekly_mileage_km numeric null,
  running_days_per_week integer null,
  lactate_threshold_hr integer null,
  vo2max numeric null,
  average_cadence integer null,
  preferred_training_days text[] null,
  preferred_run_time text null,
  strength_training_days_per_week integer null,
  available_equipment text[] null,
  injury_history text null,
  current_pain_notes text null,
  risk_notes text null,
  nutrition_goal text null,
  protein_target_g numeric null,
  carb_target_rest_day_g numeric null,
  carb_target_easy_day_g numeric null,
  carb_target_hard_day_g numeric null,
  food_preferences text null,
  allergies_or_restrictions text null,
  caffeine_habit text null,
  supplement_notes text null,
  average_sleep_hours numeric null,
  normal_sleep_score integer null,
  normal_energy_score integer null,
  normal_resting_hr integer null,
  normal_hrv numeric null,  -- 012: numeric because HRV can be a decimal measurement
  recovery_rules text null,
  coaching_tone text null,
  response_detail text null,
  language text null default 'th',
  -- 006
  birth_date date null,
  -- 008
  field_sources jsonb null,
  -- 013
  auto_profile_sync_enabled boolean not null default true,
  last_auto_profile_sync_at timestamptz null
);

create table if not exists public.race_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  race_name text not null,
  race_date date not null,
  race_distance text not null,
  goal_type text not null,
  target_time text null,
  current_longest_run_km numeric null,
  training_days_per_week integer null,
  preferred_long_run_day text null,
  injury_notes text null,
  plan_preference text null,
  status text default 'active',
  completed_at timestamptz null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  race_goal_id uuid references public.race_goals(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  total_weeks integer not null,
  current_phase text null,
  plan_summary text null,
  phases_json jsonb null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.training_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  training_plan_id uuid references public.training_plans(id) on delete cascade,
  week_number integer not null,
  phase text null,
  weekly_focus text null,
  target_weekly_distance_km numeric null,
  long_run_distance_km numeric null,
  workouts_json jsonb null,
  created_at timestamptz default now()
);

create table if not exists public.daily_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  training_plan_id uuid references public.training_plans(id) on delete cascade,
  training_week_id uuid references public.training_weeks(id) on delete set null,
  workout_date date not null,
  workout_type text not null,
  distance_km numeric null,
  target_pace text null,
  target_hr text null,
  description text null,
  adjusted_description text null,
  adjusted_reason text null,
  completed_status text default 'planned',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  log_date date not null,
  image_url text,
  sleep_duration text null,
  sleep_score integer null,
  energy_score integer null,
  resting_hr integer null,
  hrv integer null,
  sleep_quality_label text null,
  extracted_json jsonb null,
  readiness_score integer null,
  readiness_label text null,
  ai_summary text null,
  today_recommendation text null,
  nutrition_focus text null,
  recovery_focus text null,
  sleep_focus text null,
  warning_notes text null,
  created_at timestamptz default now()
);

create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  log_date date not null,
  meal_type text not null,
  image_url text,
  detected_food text null,
  protein_level text null,
  carb_level text null,
  fat_level text null,
  hydration_suggestion text null,
  training_fit text null,
  ai_summary text null,
  suggestion text null,
  extracted_json jsonb null,
  created_at timestamptz default now()
);

create table if not exists public.run_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  log_date date not null,
  image_url text,
  distance_km numeric null,
  duration text null,
  avg_pace text null,
  avg_hr integer null,
  max_hr integer null,
  cadence integer null,
  calories integer null,
  elevation_gain numeric null,
  training_effect text null,
  extracted_json jsonb null,
  run_summary text null,
  intensity_assessment text null,
  was_too_hard boolean null,
  recovery_advice text null,
  nutrition_after_run text null,
  next_run_suggestion text null,
  coach_note text null,
  created_at timestamptz default now()
);

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  log_date date not null,
  image_urls text[] null,
  workout_kind text null,
  distance_km numeric null,
  duration text null,
  avg_pace text null,
  avg_speed_kmh numeric null,
  avg_hr integer null,
  max_hr integer null,
  cadence integer null,
  calories integer null,
  elevation_gain numeric null,
  vo2_max numeric null,
  sweat_loss_ml numeric null,
  extracted_json jsonb null,
  workout_summary text null,
  intensity_assessment text null,
  training_load_note text null,
  was_too_hard boolean null,
  recovery_advice text null,
  nutrition_after_workout text null,
  next_workout_suggestion text null,
  coach_note text null,
  created_at timestamptz default now()
);

create table if not exists public.body_composition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  log_date date not null,
  image_urls text[] null,
  weight_kg numeric null,
  skeletal_muscle_kg numeric null,
  body_fat_percent numeric null,
  fat_mass_kg numeric null,
  body_water_kg numeric null,
  bmi numeric null,
  bmr_calories integer null,
  extracted_json jsonb null,
  body_summary text null,
  runner_interpretation text null,
  nutrition_focus text null,
  strength_focus text null,
  caution_notes text null,
  coach_note text null,
  created_at timestamptz default now()
);

create table if not exists public.daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  summary_date date not null,
  readiness_score integer null,
  overall_summary text null,
  training_review text null,
  nutrition_review text null,
  recovery_review text null,
  what_went_well text null,
  what_to_improve text null,
  tomorrow_plan text null,
  coach_message text null,
  summary_json jsonb null,
  created_at timestamptz default now()
);

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.history_items (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  created_at timestamptz not null,
  data jsonb not null,
  primary key (user_id, id)
);

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

-- ── Row Level Security ───────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.race_goals enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_weeks enable row level security;
alter table public.daily_workouts enable row level security;
alter table public.sleep_logs enable row level security;
alter table public.meal_logs enable row level security;
alter table public.run_logs enable row level security;
alter table public.workout_logs enable row level security;
alter table public.body_composition_logs enable row level security;
alter table public.daily_summaries enable row level security;
alter table public.coach_messages enable row level security;
alter table public.history_items enable row level security;
alter table public.race_results enable row level security;

-- ── Policies ─────────────────────────────────────────────────
create policy "own profiles" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own race goals" on public.race_goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own training plans" on public.training_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own training weeks" on public.training_weeks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own daily workouts" on public.daily_workouts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sleep logs" on public.sleep_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own meal logs" on public.meal_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own run logs" on public.run_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own workout logs" on public.workout_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own body composition logs" on public.body_composition_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own daily summaries" on public.daily_summaries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own coach messages" on public.coach_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own history items" on public.history_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own race results" on public.race_results for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Storage buckets ──────────────────────────────────────────
insert into storage.buckets (id, name, public)
values
  ('sleep-images',   'sleep-images',   true),
  ('meal-images',    'meal-images',    true),
  ('run-images',     'run-images',     true),
  ('workout-images', 'workout-images', true),
  ('body-images',    'body-images',    true)
on conflict (id) do nothing;

create policy "upload sleep images"   on storage.objects for insert with check (bucket_id = 'sleep-images'   and auth.role() = 'authenticated');
create policy "read sleep images"     on storage.objects for select using  (bucket_id = 'sleep-images'   and auth.role() = 'authenticated');
create policy "upload meal images"    on storage.objects for insert with check (bucket_id = 'meal-images'    and auth.role() = 'authenticated');
create policy "read meal images"      on storage.objects for select using  (bucket_id = 'meal-images'    and auth.role() = 'authenticated');
create policy "upload run images"     on storage.objects for insert with check (bucket_id = 'run-images'     and auth.role() = 'authenticated');
create policy "read run images"       on storage.objects for select using  (bucket_id = 'run-images'     and auth.role() = 'authenticated');
create policy "upload workout images" on storage.objects for insert with check (bucket_id = 'workout-images' and auth.role() = 'authenticated');
create policy "read workout images"   on storage.objects for select using  (bucket_id = 'workout-images' and auth.role() = 'authenticated');
create policy "upload body images"    on storage.objects for insert with check (bucket_id = 'body-images'    and auth.role() = 'authenticated');
create policy "read body images"      on storage.objects for select using  (bucket_id = 'body-images'    and auth.role() = 'authenticated');

-- ── Grants ───────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
