ALTER TYPE public.subscription_tier ADD VALUE IF NOT EXISTS 'pro' BEFORE 'premium';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS stripe_billing_interval text,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles(stripe_customer_id);

ALTER TABLE public.call_sessions
  ADD COLUMN IF NOT EXISTS input_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.stripe_webhook_events TO service_role;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages stripe webhook events"
  ON public.stripe_webhook_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');