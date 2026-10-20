ALTER TABLE public.app_settings
  ADD COLUMN currency_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN recurring_cadence text,
  ADD COLUMN recurring_due_days integer,
  ADD COLUMN confirmed_by uuid,
  ADD COLUMN confirmed_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN period_start date, ADD COLUMN period_end date;
CREATE UNIQUE INDEX invoices_subscription_period_uq ON public.invoices(subscription_id, period_start) WHERE period_start IS NOT NULL AND state <> 'void';

CREATE OR REPLACE FUNCTION public.validate_app_settings() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.recurring_cadence IS NOT NULL AND NEW.recurring_cadence NOT IN ('monthly') THEN RAISE EXCEPTION 'Only monthly cadence is supported'; END IF;
  IF NEW.recurring_due_days IS NOT NULL AND NEW.recurring_due_days NOT BETWEEN 0 AND 90 THEN RAISE EXCEPTION 'Due days must be 0-90'; END IF;
  IF NEW.currency_code !~ '^[A-Z]{3}$' OR length(trim(NEW.currency_symbol)) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid currency'; END IF;
  IF NEW.currency_code <> OLD.currency_code OR NEW.currency_symbol <> OLD.currency_symbol THEN
    IF EXISTS (SELECT 1 FROM public.invoices) OR EXISTS (SELECT 1 FROM public.payments) THEN RAISE EXCEPTION 'Currency cannot change after financial records exist'; END IF;
  END IF;
  IF NEW.currency_confirmed AND NOT OLD.currency_confirmed THEN NEW.confirmed_by := auth.uid(); NEW.confirmed_at := now(); END IF;
  IF NOT NEW.currency_confirmed THEN NEW.confirmed_by := NULL; NEW.confirmed_at := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER app_settings_validate BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.validate_app_settings();
REVOKE EXECUTE ON FUNCTION public.validate_app_settings() FROM PUBLIC, anon, authenticated;

-- Read-only preview: active services and what a monthly invoice would be. Changes nothing.
CREATE OR REPLACE FUNCTION public.preview_recurring_invoices(_period_start date)
RETURNS TABLE(subscription_id uuid, customer_id uuid, customer_name text, plan_name text, amount numeric, period_start date, period_end date, already_invoiced boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_billing_writer();
  IF _period_start IS NULL OR extract(day FROM _period_start) <> 1 THEN RAISE EXCEPTION 'Period must start on the first day of a month'; END IF;
  RETURN QUERY
  SELECT s.id, c.id, c.full_name, p.name, round(p.monthly_price,2), _period_start, (_period_start + interval '1 month' - interval '1 day')::date,
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.subscription_id = s.id AND i.period_start = _period_start AND i.state <> 'void')
  FROM public.subscriptions s JOIN public.customers c ON c.id = s.customer_id JOIN public.service_plans p ON p.id = s.plan_id
  WHERE s.status = 'active' AND p.monthly_price > 0 AND (s.start_date IS NULL OR s.start_date <= (_period_start + interval '1 month' - interval '1 day')::date)
  ORDER BY c.full_name;
END $$;

CREATE OR REPLACE FUNCTION public.generate_recurring_invoices(_period_start date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st public.app_settings; r record; n integer := 0; inv uuid;
BEGIN
  PERFORM public.require_billing_writer();
  SELECT * INTO st FROM public.app_settings WHERE id = 1 FOR SHARE;
  IF NOT st.currency_confirmed OR st.recurring_cadence IS NULL OR st.recurring_due_days IS NULL THEN
    RAISE EXCEPTION 'Recurring billing is not configured: Weonet must confirm currency, cadence and due days';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('recurring:' || _period_start::text));
  FOR r IN SELECT * FROM public.preview_recurring_invoices(_period_start) WHERE NOT already_invoiced LOOP
    inv := public.create_invoice(r.customer_id, _period_start + st.recurring_due_days,
      jsonb_build_array(jsonb_build_object('description', r.plan_name || ' service ' || r.period_start || ' to ' || r.period_end, 'quantity', 1, 'unit_price', r.amount)),
      'Recurring draft', r.subscription_id);
    UPDATE public.invoices SET period_start = r.period_start, period_end = r.period_end WHERE id = inv;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.preview_recurring_invoices(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_recurring_invoices(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_recurring_invoices(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recurring_invoices(date) TO authenticated;