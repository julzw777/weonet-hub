-- Generic audit trigger (runs server-side, cannot be skipped by the browser)
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id text; _details jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN _id := OLD.id::text; _details := jsonb_build_object('old', to_jsonb(OLD));
  ELSIF TG_OP = 'INSERT' THEN _id := NEW.id::text; _details := jsonb_build_object('new', to_jsonb(NEW));
  ELSE _id := NEW.id::text; _details := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), lower(TG_OP), TG_TABLE_NAME, _id, _details);
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_audit_customers AFTER INSERT OR UPDATE OR DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER trg_audit_subscriptions AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER trg_audit_plans AFTER INSERT OR UPDATE OR DELETE ON public.service_plans FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER trg_audit_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER trg_audit_settings AFTER UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Subscription lifecycle validation
CREATE OR REPLACE FUNCTION public.validate_subscription_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','active','suspended','cancelled') THEN
    RAISE EXCEPTION 'Invalid subscription status %', NEW.status;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('active','cancelled')) OR
      (OLD.status = 'active' AND NEW.status IN ('suspended','cancelled')) OR
      (OLD.status = 'suspended' AND NEW.status IN ('active','cancelled'))
    ) THEN
      RAISE EXCEPTION 'Cannot change subscription from % to %', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'active' AND NEW.start_date IS NULL THEN NEW.start_date := current_date; END IF;
    IF NEW.status = 'cancelled' THEN NEW.end_date := COALESCE(NEW.end_date, current_date); END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_subs_validate BEFORE INSERT OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.validate_subscription_status();

-- Customer validation
CREATE OR REPLACE FUNCTION public.validate_customer()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF length(trim(NEW.full_name)) = 0 THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF NEW.status NOT IN ('active','inactive','suspended') THEN RAISE EXCEPTION 'Invalid customer status'; END IF;
  IF NEW.customer_type NOT IN ('residential','business') THEN RAISE EXCEPTION 'Invalid customer type'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_customers_validate BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.validate_customer();

-- Admins may not remove their own admin role (prevents lockout)
CREATE OR REPLACE FUNCTION public.protect_own_admin_role()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.role = 'admin' AND OLD.user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove your own admin role';
  END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER trg_roles_protect BEFORE DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.protect_own_admin_role();

DO $$ BEGIN
  ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_role_key UNIQUE (user_id, role);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON public.subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_location ON public.customers(location_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs(entity, entity_id);