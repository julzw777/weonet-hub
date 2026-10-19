CREATE TABLE public.invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number text NOT NULL UNIQUE DEFAULT ('INV-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))), customer_id uuid NOT NULL REFERENCES public.customers(id), state text NOT NULL DEFAULT 'draft', due_date date NOT NULL, currency_code text NOT NULL, currency_symbol text NOT NULL, total numeric(14,2) NOT NULL, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Billing readers" ON public.invoices FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','finance','care','readonly']::public.staff_role[]));
CREATE TABLE public.invoice_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES public.invoices(id), description text NOT NULL, quantity numeric(12,2) NOT NULL, unit_price numeric(14,2) NOT NULL, amount numeric(14,2) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Billing readers" ON public.invoice_items FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','finance','care','readonly']::public.staff_role[]));
CREATE TABLE public.payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid REFERENCES public.customers(id), channel text NOT NULL, reference text NOT NULL, amount numeric(14,2) NOT NULL, currency_code text NOT NULL, currency_symbol text NOT NULL, received_date date NOT NULL, reversed boolean NOT NULL DEFAULT false, reversal_reason text, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(channel,reference)
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Billing readers" ON public.payments FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','finance','care','readonly']::public.staff_role[]));
CREATE TABLE public.payment_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES public.payments(id), invoice_id uuid NOT NULL REFERENCES public.invoices(id), amount numeric(14,2) NOT NULL, reversed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_allocations TO authenticated;
GRANT ALL ON public.payment_allocations TO service_role;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Billing readers" ON public.payment_allocations FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','finance','care','readonly']::public.staff_role[]));
CREATE INDEX invoices_customer_idx ON public.invoices(customer_id);
CREATE INDEX payments_customer_idx ON public.payments(customer_id);
CREATE INDEX allocations_payment_idx ON public.payment_allocations(payment_id);
CREATE INDEX allocations_invoice_idx ON public.payment_allocations(invoice_id);
CREATE TRIGGER invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER allocations_updated BEFORE UPDATE ON public.payment_allocations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER invoices_audit AFTER INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER items_audit AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER payments_audit AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER allocations_audit AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE FUNCTION public.require_billing_writer() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(), ARRAY['admin','finance']::public.staff_role[]) THEN RAISE EXCEPTION 'Only Finance or Admin can change billing' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.require_billing_writer() FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.create_invoice(_customer_id uuid, _due_date date, _items jsonb, _notes text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid; _total numeric := 0; _item jsonb; _q numeric; _p numeric; _settings public.app_settings;
BEGIN
 PERFORM public.require_billing_writer();
 IF _due_date IS NULL OR jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Due date and 1–100 invoice lines required'; END IF;
 SELECT * INTO _settings FROM public.app_settings WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Currency settings missing'; END IF;
 FOR _item IN SELECT value FROM jsonb_array_elements(_items) LOOP
  _q:=(_item->>'quantity')::numeric; _p:=(_item->>'unit_price')::numeric;
  IF _q IS NULL OR _p IS NULL OR _q::text IN ('NaN','Infinity','-Infinity') OR _p::text IN ('NaN','Infinity','-Infinity') OR _q<=0 OR _p<0 OR _q<>round(_q,2) OR _p<>round(_p,2) OR length(trim(coalesce(_item->>'description',''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid invoice line'; END IF;
  _total:=_total+round(_q*_p,2);
 END LOOP;
 IF _total<=0 THEN RAISE EXCEPTION 'Invoice total must be positive'; END IF;
 INSERT INTO public.invoices(customer_id,due_date,currency_code,currency_symbol,total,notes) VALUES(_customer_id,_due_date,_settings.currency_code,_settings.currency_symbol,_total,left(_notes,2000)) RETURNING id INTO _id;
 INSERT INTO public.invoice_items(invoice_id,description,quantity,unit_price,amount) SELECT _id,trim(value->>'description'),(value->>'quantity')::numeric,(value->>'unit_price')::numeric,round((value->>'quantity')::numeric*(value->>'unit_price')::numeric,2) FROM jsonb_array_elements(_items);
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.create_invoice(uuid,date,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_invoice(uuid,date,jsonb,text) TO authenticated;
CREATE FUNCTION public.set_invoice_state(_id uuid, _state text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _invoice public.invoices;
BEGIN
 PERFORM public.require_billing_writer();
 SELECT * INTO _invoice FROM public.invoices WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
 IF NOT ((_invoice.state='draft' AND _state IN ('issued','void')) OR (_invoice.state='issued' AND _state='void')) THEN RAISE EXCEPTION 'Invalid invoice transition'; END IF;
 IF _state='void' AND EXISTS(SELECT 1 FROM public.payment_allocations WHERE invoice_id=_id AND NOT reversed) THEN RAISE EXCEPTION 'Reverse allocated payments before voiding'; END IF;
 UPDATE public.invoices SET state=_state WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.set_invoice_state(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_invoice_state(uuid,text) TO authenticated;
CREATE FUNCTION public.record_payment(_customer_id uuid, _channel text, _reference text, _amount numeric, _received_date date, _notes text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid; _settings public.app_settings;
BEGIN
 PERFORM public.require_billing_writer();
 IF _channel IS NULL OR _channel NOT IN ('bank_transfer','orange_money','afrimoney','vult') OR length(trim(coalesce(_reference,''))) NOT BETWEEN 1 AND 200 OR _amount IS NULL OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount<=0 OR _amount<>round(_amount,2) OR _received_date IS NULL OR _received_date>CURRENT_DATE THEN RAISE EXCEPTION 'Invalid payment details'; END IF;
 SELECT * INTO _settings FROM public.app_settings WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Currency settings missing'; END IF;
 INSERT INTO public.payments(customer_id,channel,reference,amount,currency_code,currency_symbol,received_date,notes) VALUES(_customer_id,_channel,upper(trim(_reference)),_amount,_settings.currency_code,_settings.currency_symbol,_received_date,left(_notes,2000)) RETURNING id INTO _id;
 RETURN _id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'A payment with this channel and reference already exists';
END $$;
REVOKE ALL ON FUNCTION public.record_payment(uuid,text,text,numeric,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid,text,text,numeric,date,text) TO authenticated;
CREATE FUNCTION public.allocate_payment(_payment_id uuid, _invoice_id uuid, _amount numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _payment public.payments; _invoice public.invoices; _used numeric; _paid numeric;
BEGIN
 PERFORM public.require_billing_writer();
 SELECT * INTO _payment FROM public.payments WHERE id=_payment_id FOR UPDATE;
 IF NOT FOUND OR _payment.reversed THEN RAISE EXCEPTION 'Payment missing or reversed'; END IF;
 SELECT * INTO _invoice FROM public.invoices WHERE id=_invoice_id FOR UPDATE;
 IF NOT FOUND OR _invoice.state<>'issued' THEN RAISE EXCEPTION 'Only issued invoices can receive payments'; END IF;
 IF _payment.currency_code<>_invoice.currency_code THEN RAISE EXCEPTION 'Currencies do not match'; END IF;
 IF _payment.customer_id IS NOT NULL AND _payment.customer_id<>_invoice.customer_id THEN RAISE EXCEPTION 'Payment belongs to a different customer'; END IF;
 SELECT coalesce(sum(amount),0) INTO _used FROM public.payment_allocations WHERE payment_id=_payment_id AND NOT reversed;
 SELECT coalesce(sum(amount),0) INTO _paid FROM public.payment_allocations WHERE invoice_id=_invoice_id AND NOT reversed;
 IF _amount IS NULL OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount<=0 OR _amount<>round(_amount,2) OR _amount>_payment.amount-_used OR _amount>_invoice.total-_paid THEN RAISE EXCEPTION 'Allocation must be positive and cannot exceed remaining payment or invoice balance'; END IF;
 UPDATE public.payments SET customer_id=_invoice.customer_id WHERE id=_payment_id AND customer_id IS NULL;
 INSERT INTO public.payment_allocations(payment_id,invoice_id,amount) VALUES(_payment_id,_invoice_id,_amount);
END $$;
REVOKE ALL ON FUNCTION public.allocate_payment(uuid,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.allocate_payment(uuid,uuid,numeric) TO authenticated;
CREATE FUNCTION public.reverse_payment(_id uuid, _reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _payment public.payments;
BEGIN
 PERFORM public.require_billing_writer();
 IF length(trim(coalesce(_reason,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'A reversal reason is required'; END IF;
 SELECT * INTO _payment FROM public.payments WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR _payment.reversed THEN RAISE EXCEPTION 'Payment missing or already reversed'; END IF;
 PERFORM id FROM public.invoices WHERE id IN (SELECT invoice_id FROM public.payment_allocations WHERE payment_id=_id AND NOT reversed) ORDER BY id FOR UPDATE;
 UPDATE public.payment_allocations SET reversed=true WHERE payment_id=_id AND NOT reversed;
 UPDATE public.payments SET reversed=true,reversal_reason=trim(_reason) WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.reverse_payment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reverse_payment(uuid,text) TO authenticated;