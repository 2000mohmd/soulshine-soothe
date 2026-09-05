ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS care_plan text,
  ADD COLUMN IF NOT EXISTS care_plan_focus text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS care_plan_updated_at timestamptz;