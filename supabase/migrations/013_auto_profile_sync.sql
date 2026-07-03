-- Persist Auto Sync preference and last sync timestamp in the profile row.
-- auto_profile_sync_enabled defaults true so existing users inherit the enabled state.
alter table public.profiles
  add column if not exists auto_profile_sync_enabled boolean not null default true,
  add column if not exists last_auto_profile_sync_at timestamptz null;
