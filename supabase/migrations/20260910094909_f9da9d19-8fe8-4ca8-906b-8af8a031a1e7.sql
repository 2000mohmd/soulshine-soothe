-- 1. SAFETY PLANS -----------------------------------------------------------
CREATE TABLE public.safety_plans (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  warning_signs text[] NOT NULL DEFAULT '{}',
  coping_steps text[] NOT NULL DEFAULT '{}',
  people text[] NOT NULL DEFAULT '{}',
  professionals text[] NOT NULL DEFAULT '{}',
  safer_space text[] NOT NULL DEFAULT '{}',
  reasons_to_stay text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_plans TO authenticated;
GRANT ALL ON public.safety_plans TO service_role;

ALTER TABLE public.safety_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own safety plan"
  ON public.safety_plans FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER safety_plans_updated_at
  BEFORE UPDATE ON public.safety_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. HUMAN SUPPORT REQUESTS --------------------------------------------------
CREATE TABLE public.human_support_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.chat_threads(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','claimed','closed')),
  severity text CHECK (severity IN ('critical','high','moderate')),
  summary text,
  preferred_name text,
  language text NOT NULL DEFAULT 'en',
  timezone text,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  closed_at timestamptz,
  alert_sent_at timestamptz,
  escalation_sent_at timestamptz,
  escalation_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX human_support_requests_user_idx ON public.human_support_requests (user_id, created_at DESC);
CREATE INDEX human_support_requests_status_idx ON public.human_support_requests (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.human_support_requests TO authenticated;
GRANT ALL ON public.human_support_requests TO service_role;

ALTER TABLE public.human_support_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own human support requests"
  ON public.human_support_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members create their own human support requests"
  ON public.human_support_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all human support requests"
  ON public.human_support_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins update human support requests"
  ON public.human_support_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER human_support_requests_updated_at
  BEFORE UPDATE ON public.human_support_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. HUMAN SUPPORT MESSAGES --------------------------------------------------
CREATE TABLE public.human_support_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.human_support_requests(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('user','human')),
  content text NOT NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX human_support_messages_request_idx ON public.human_support_messages (request_id, created_at);

GRANT SELECT, INSERT ON public.human_support_messages TO authenticated;
GRANT ALL ON public.human_support_messages TO service_role;

ALTER TABLE public.human_support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read messages on their own requests"
  ON public.human_support_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.human_support_requests r
    WHERE r.id = request_id AND r.user_id = auth.uid()
  ));

CREATE POLICY "Members write messages on their own requests"
  ON public.human_support_messages FOR INSERT TO authenticated
  WITH CHECK (sender = 'user' AND EXISTS (
    SELECT 1 FROM public.human_support_requests r
    WHERE r.id = request_id AND r.user_id = auth.uid()
  ));

CREATE POLICY "Admins read all human support messages"
  ON public.human_support_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins write human support messages"
  ON public.human_support_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 4. GUARDIAN CONSENT --------------------------------------------------------
CREATE TABLE public.guardian_consents (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  guardian_email text NOT NULL,
  guardian_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','granted','withdrawn')),
  token_hash text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  consent_ip text,
  consent_user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guardian_consents TO authenticated;
GRANT ALL ON public.guardian_consents TO service_role;

ALTER TABLE public.guardian_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own guardian consent"
  ON public.guardian_consents FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read guardian consents"
  ON public.guardian_consents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER guardian_consents_updated_at
  BEFORE UPDATE ON public.guardian_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. PROFILE MARKER ----------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS guardian_consent_required boolean NOT NULL DEFAULT false;