-- Add status tracking to race_goals
alter table public.race_goals
  add column if not exists status text default 'active',
  add column if not exists completed_at timestamptz;

-- Partial unique index on race_results: no duplicate results for the same saved workout
create unique index if not exists race_results_user_linked_uniq
  on public.race_results(user_id, linked_history_item_id)
  where linked_history_item_id is not null;
