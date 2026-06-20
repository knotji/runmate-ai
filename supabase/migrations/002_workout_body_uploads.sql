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

alter table public.workout_logs enable row level security;
alter table public.body_composition_logs enable row level security;

create policy "own workout logs" on public.workout_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own body composition logs" on public.body_composition_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('workout-images', 'workout-images', true),
       ('body-images', 'body-images', true)
on conflict (id) do nothing;

create policy "users can upload workout images" on storage.objects
  for insert with check (bucket_id = 'workout-images' and auth.role() = 'authenticated');
create policy "users can read workout images" on storage.objects
  for select using (bucket_id = 'workout-images' and auth.role() = 'authenticated');
create policy "users can upload body images" on storage.objects
  for insert with check (bucket_id = 'body-images' and auth.role() = 'authenticated');
create policy "users can read body images" on storage.objects
  for select using (bucket_id = 'body-images' and auth.role() = 'authenticated');
