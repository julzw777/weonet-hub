CREATE TABLE public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_code text NOT NULL DEFAULT 'SLE',
  quote_code text NOT NULL DEFAULT 'USD',
  quote_symbol text NOT NULL DEFAULT '$',
  base_per_quote numeric(18,6) NOT NULL,
  note text,
  set_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exchange_rates TO authenticated;
GRANT ALL ON public.exchange_rates TO service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Billing readers view rates" ON public.exchange_rates FOR SELECT TO authenticated
 USING (public.has_any_role(auth.uid(), ARRAY['admin','finance','care','readonly']::staff_role[]));
CREATE INDEX exchange_rates_created_idx ON public.exchange_rates(created_at DESC);
CREATE TRIGGER exchange_rates_audit AFTER INSERT OR UPDATE OR DELETE ON public.exchange_rates FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE OR REPLACE FUNCTION public.set_exchange_rate(_base_per_quote numeric, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid; base text;
BEGIN
  PERFORM public.require_billing_writer();
  IF _base_per_quote IS NULL OR _base_per_quote::text IN ('NaN','Infinity','-Infinity') OR _base_per_quote <= 0 OR _base_per_quote > 1000000000 OR _base_per_quote <> round(_base_per_quote, 6) THEN
    RAISE EXCEPTION 'Rate must be a positive number with up to 6 decimals'; END IF;
  IF length(coalesce(_note,'')) > 500 THEN RAISE EXCEPTION 'Note too long'; END IF;
  SELECT currency_code INTO base FROM public.app_settings WHERE id = 1;
  INSERT INTO public.exchange_rates(base_code, base_per_quote, note, set_by) VALUES (base, _base_per_quote, nullif(trim(_note),''), auth.uid()) RETURNING id INTO rid;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.set_exchange_rate(numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_exchange_rate(numeric, text) TO authenticated;
REVOKE ALL ON public.exchange_rates FROM anon;