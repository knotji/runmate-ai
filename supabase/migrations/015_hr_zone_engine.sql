alter table public.profiles add column if not exists hr_zone_method text null;
alter table public.profiles add column if not exists aerobic_threshold_hr integer null;
alter table public.profiles add column if not exists anaerobic_threshold_hr integer null;
