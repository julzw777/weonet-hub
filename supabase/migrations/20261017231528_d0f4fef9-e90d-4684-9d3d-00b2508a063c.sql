CREATE TYPE public.staff_role AS ENUM ('admin','noc','finance','care','tech','warehouse','readonly');

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.staff_profiles TO authenticated;
GRANT ALL ON public.staff_profiles TO service_role;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.staff_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.staff_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.staff_role[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE POLICY "Staff view profiles" ON public.staff_profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "Self or admin update profile" ON public.staff_profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "View own or admin views roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin assigns roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin removes roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_staff_profiles_updated BEFORE UPDATE ON public.staff_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- New signups get a profile; first user becomes admin, others readonly
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.staff_profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email);
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'readonly');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.app_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  currency_code text NOT NULL DEFAULT 'SLE',
  currency_symbol text NOT NULL DEFAULT 'Le',
  company_name text NOT NULL DEFAULT 'Weonet',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read settings" ON public.app_settings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin update settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
INSERT INTO public.app_settings (id) VALUES (1);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Staff write own audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() AND public.is_staff(auth.uid()));

CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  district text,
  latitude numeric,
  longitude numeric,
  pop_site text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number text UNIQUE NOT NULL DEFAULT ('WN-' || lpad((floor(random()*1000000))::text, 6, '0')),
  full_name text NOT NULL,
  email text,
  phone text,
  customer_type text NOT NULL DEFAULT 'residential',
  status text NOT NULL DEFAULT 'active',
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.service_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  technology text NOT NULL DEFAULT 'fiber',
  download_mbps int NOT NULL,
  upload_mbps int NOT NULL,
  monthly_price numeric(12,2) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.service_plans(id),
  status text NOT NULL DEFAULT 'pending',
  pppoe_username text UNIQUE,
  ip_address text,
  vlan int,
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations, public.customers, public.service_plans, public.subscriptions TO authenticated;
GRANT ALL ON public.locations, public.customers, public.service_plans, public.subscriptions TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read locations" ON public.locations FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Care/Tech/Admin write locations" ON public.locations FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','care','tech']::public.staff_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','care','tech']::public.staff_role[]));
CREATE POLICY "Staff read customers" ON public.customers FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Care/Admin write customers" ON public.customers FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','care']::public.staff_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','care']::public.staff_role[]));
CREATE POLICY "Staff read plans" ON public.service_plans FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Finance/Admin write plans" ON public.service_plans FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','finance']::public.staff_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','finance']::public.staff_role[]));
CREATE POLICY "Staff read subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Care/NOC/Admin write subscriptions" ON public.subscriptions FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','care','noc']::public.staff_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','care','noc']::public.staff_role[]));

CREATE TRIGGER trg_locations_updated BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.service_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.service_plans (name, technology, download_mbps, upload_mbps, monthly_price) VALUES
('Home Basic', 'fiber', 20, 10, 750),
('Home Plus', 'fiber', 50, 25, 1250),
('Business Pro', 'fiber', 100, 50, 3000),
('Hotspot Daily', 'hotspot', 10, 5, 25);