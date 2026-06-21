alter table public.profiles
  add column if not exists protein_target_g numeric null,
  add column if not exists carb_target_rest_day_g numeric null,
  add column if not exists carb_target_easy_day_g numeric null,
  add column if not exists carb_target_hard_day_g numeric null;
