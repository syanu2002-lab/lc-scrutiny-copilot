
-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  role text NOT NULL DEFAULT 'MAKER' CHECK (role IN ('MAKER','CHECKER')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper security definer to read a user's role without recursion
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = _user_id;
$$;

CREATE POLICY "profiles self select" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles checker select all" ON public.profiles
  FOR SELECT TO authenticated USING (public.get_user_role(auth.uid()) = 'CHECKER');

CREATE POLICY "profiles self insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles self update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'MAKER')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SCRUTINY CASES
CREATE TABLE public.scrutiny_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lc_reference text NOT NULL,
  lc_text text,
  maker_id uuid NOT NULL REFERENCES public.profiles(id),
  checker_id uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_CHECKER','AUTHORIZED','REJECTED')),
  ai_analysis_raw jsonb,
  maker_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.scrutiny_cases TO authenticated;
GRANT ALL ON public.scrutiny_cases TO service_role;
ALTER TABLE public.scrutiny_cases ENABLE ROW LEVEL SECURITY;

-- Maker sees own cases
CREATE POLICY "cases maker select own" ON public.scrutiny_cases
  FOR SELECT TO authenticated
  USING (maker_id = auth.uid());

-- Checker sees pending/authorized/rejected cases (not other makers' drafts)
CREATE POLICY "cases checker select reviewable" ON public.scrutiny_cases
  FOR SELECT TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'CHECKER'
    AND status IN ('PENDING_CHECKER','AUTHORIZED','REJECTED')
  );

-- Only Makers can insert their own case
CREATE POLICY "cases maker insert" ON public.scrutiny_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    maker_id = auth.uid()
    AND public.get_user_role(auth.uid()) = 'MAKER'
  );

-- Maker can update only their own DRAFT case
CREATE POLICY "cases maker update draft" ON public.scrutiny_cases
  FOR UPDATE TO authenticated
  USING (
    maker_id = auth.uid()
    AND status IN ('DRAFT','PENDING_CHECKER')
    AND public.get_user_role(auth.uid()) = 'MAKER'
  );

-- Checker can update pending cases but NOT cases they made (dual-control enforced)
CREATE POLICY "cases checker update pending" ON public.scrutiny_cases
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'CHECKER'
    AND status = 'PENDING_CHECKER'
    AND maker_id <> auth.uid()
  );

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER scrutiny_cases_touch
  BEFORE UPDATE ON public.scrutiny_cases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- SWIFT DRAFTS
CREATE TABLE public.swift_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scrutiny_cases(id) ON DELETE CASCADE,
  lc_reference text,
  mt_type text NOT NULL CHECK (mt_type IN ('MT734','MT752','MT754')),
  message_body text NOT NULL,
  generated_by uuid REFERENCES public.profiles(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','COPIED_TO_TERMINAL'))
);
GRANT SELECT, INSERT, UPDATE ON public.swift_drafts TO authenticated;
GRANT ALL ON public.swift_drafts TO service_role;
ALTER TABLE public.swift_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swift select related" ON public.swift_drafts
  FOR SELECT TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'CHECKER'
    OR EXISTS (SELECT 1 FROM public.scrutiny_cases c WHERE c.id = case_id AND c.maker_id = auth.uid())
  );

CREATE POLICY "swift insert authenticated" ON public.swift_drafts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.scrutiny_cases c WHERE c.id = case_id AND (c.maker_id = auth.uid() OR public.get_user_role(auth.uid()) = 'CHECKER'))
  );

CREATE POLICY "swift update checker" ON public.swift_drafts
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'CHECKER');
