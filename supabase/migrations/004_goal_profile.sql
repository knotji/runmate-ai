-- v0.2: Add goal_profile JSONB column to profiles table
-- Stores UserGoalProfile: primaryGoal, secondaryGoals, guardrailGoals, raceGoal, bodyGoal, lifestyleGoal
alter table public.profiles
  add column if not exists goal_profile jsonb null;
