ALTER TABLE public.invoices ADD COLUMN subscription_id uuid REFERENCES public.subscriptions(id), ADD COLUMN issued_at timestamptz;
CREATE INDEX ON public.invoices(subscription_id);
ALTER TABLE public.payments ADD COLUMN failed boolean NOT NULL DEFAULT false, ADD COLUMN failure_reason text;

CREATE TABLE public.credit_notes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL REFERENCES public.invoices(id),
 amount numeric NOT NULL,
 reason text NOT NULL,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON public.credit_notes(invoice_id);
GRANT SELECT ON public.credit_notes TO authenticated;
GRANT ALL ON public.credit_notes TO service_role;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Billing readers" ON public.credit_notes FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','finance','care','readonly']::public.staff_role[]));
CREATE TRIGGER credit_notes_audit AFTER INSERT OR UPDATE OR DELETE ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP FUNCTION public.create_invoice(uuid,date,jsonb,text);
CREATE FUNCTION public.create_invoice(_customer_id uuid, _due_date date, _items jsonb, _notes text DEFAULT NULL, _subscription_id uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE _id uuid; _total numeric := 0; _item jsonb; _q numeric; _p numeric; _settings public.app_settings;
BEGIN
 PERFORM public.require_billing_writer();
 IF _due_date IS NULL OR jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Due date and 1–100 invoice lines required'; END IF;
 IF _subscription_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE id=_subscription_id AND customer_id=_customer_id) THEN RAISE EXCEPTION 'Service does not belong to this customer'; END IF;
 SELECT * INTO _settings FROM public.app_settings WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Currency settings missing'; END IF;
 FOR _item IN SELECT value FROM jsonb_array_elements(_items) LOOP
  _q:=(_item->>'quantity')::numeric; _p:=(_item->>'unit_price')::numeric;
  IF _q IS NULL OR _p IS NULL OR _q::text IN ('NaN','Infinity','-Infinity') OR _p::text IN ('NaN','Infinity','-Infinity') OR _q<=0 OR _p<0 OR _q<>round(_q,2) OR _p<>round(_p,2) OR length(trim(coalesce(_item->>'description',''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid invoice line'; END IF;
  _total:=_total+round(_q*_p,2);
 END LOOP;
 IF _total<=0 THEN RAISE EXCEPTION 'Invoice total must be positive'; END IF;
 INSERT INTO public.invoices(customer_id,subscription_id,due_date,currency_code,currency_symbol,total,notes) VALUES(_customer_id,_subscription_id,_due_date,_settings.currency_code,_settings.currency_symbol,_total,left(_notes,2000)) RETURNING id INTO _id;
 INSERT INTO public.invoice_items(invoice_id,description,quantity,unit_price,amount) SELECT _id,trim(value->>'description'),(value->>'quantity')::numeric,(value->>'unit_price')::numeric,round((value->>'quantity')::numeric*(value->>'unit_price')::numeric,2) FROM jsonb_array_elements(_items);
 RETURN _id;
END $f$;

CREATE OR REPLACE FUNCTION public.set_invoice_state(_id uuid, _state text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE _invoice public.invoices;
BEGIN
 PERFORM public.require_billing_writer();
 SELECT * INTO _invoice FROM public.invoices WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
 IF NOT ((_invoice.state='draft' AND _state IN ('issued','void')) OR (_invoice.state='issued' AND _state='void')) THEN RAISE EXCEPTION 'Invalid invoice transition'; END IF;
 IF _state='void' AND EXISTS(SELECT 1 FROM public.payment_allocations WHERE invoice_id=_id AND NOT reversed) THEN RAISE EXCEPTION 'Reverse allocated payments before voiding'; END IF;
 UPDATE public.invoices SET state=_state, issued_at=CASE WHEN _state='issued' THEN now() ELSE issued_at END WHERE id=_id;
END $f$;

-- Balance now = total - allocations - credit notes
CREATE OR REPLACE FUNCTION public.allocate_payment(_payment_id uuid, _invoice_id uuid, _amount numeric)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE _payment public.payments; _invoice public.invoices; _used numeric; _paid numeric; _credit numeric;
BEGIN
 PERFORM public.require_billing_writer();
 SELECT * INTO _payment FROM public.payments WHERE id=_payment_id FOR UPDATE;
 IF NOT FOUND OR _payment.reversed OR _payment.failed THEN RAISE EXCEPTION 'Payment missing, reversed or failed'; END IF;
 SELECT * INTO _invoice FROM public.invoices WHERE id=_invoice_id FOR UPDATE;
 IF NOT FOUND OR _invoice.state<>'issued' THEN RAISE EXCEPTION 'Only issued invoices can receive payments'; END IF;
 IF _payment.currency_code<>_invoice.currency_code THEN RAISE EXCEPTION 'Currencies do not match'; END IF;
 IF _payment.customer_id IS NOT NULL AND _payment.customer_id<>_invoice.customer_id THEN RAISE EXCEPTION 'Payment belongs to a different customer'; END IF;
 SELECT coalesce(sum(amount),0) INTO _used FROM public.payment_allocations WHERE payment_id=_payment_id AND NOT reversed;
 SELECT coalesce(sum(amount),0) INTO _paid FROM public.payment_allocations WHERE invoice_id=_invoice_id AND NOT reversed;
 SELECT coalesce(sum(amount),0) INTO _credit FROM public.credit_notes WHERE invoice_id=_invoice_id;
 IF _amount IS NULL OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount<=0 OR _amount<>round(_amount,2) OR _amount>_payment.amount-_used OR _amount>_invoice.total-_paid-_credit THEN RAISE EXCEPTION 'Allocation must be positive and cannot exceed remaining payment or invoice balance'; END IF;
 UPDATE public.payments SET customer_id=_invoice.customer_id WHERE id=_payment_id AND customer_id IS NULL;
 INSERT INTO public.payment_allocations(payment_id,invoice_id,amount) VALUES(_payment_id,_invoice_id,_amount);
END $f$;

CREATE FUNCTION public.issue_credit_note(_invoice_id uuid, _amount numeric, _reason text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE _invoice public.invoices; _paid numeric; _credit numeric; _id uuid;
BEGIN
 PERFORM public.require_billing_writer();
 IF length(trim(coalesce(_reason,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'A credit note reason is required'; END IF;
 SELECT * INTO _invoice FROM public.invoices WHERE id=_invoice_id FOR UPDATE;
 IF NOT FOUND OR _invoice.state<>'issued' THEN RAISE EXCEPTION 'Credit notes apply only to issued invoices'; END IF;
 SELECT coalesce(sum(amount),0) INTO _paid FROM public.payment_allocations WHERE invoice_id=_invoice_id AND NOT reversed;
 SELECT coalesce(sum(amount),0) INTO _credit FROM public.credit_notes WHERE invoice_id=_invoice_id;
 IF _amount IS NULL OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount<=0 OR _amount<>round(_amount,2) OR _amount>_invoice.total-_paid-_credit THEN RAISE EXCEPTION 'Credit must be positive and cannot exceed the invoice balance'; END IF;
 INSERT INTO public.credit_notes(invoice_id,amount,reason,created_by) VALUES(_invoice_id,_amount,trim(_reason),auth.uid()) RETURNING id INTO _id;
 RETURN _id;
END $f$;

CREATE FUNCTION public.mark_payment_failed(_id uuid, _reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE _payment public.payments;
BEGIN
 PERFORM public.require_billing_writer();
 IF length(trim(coalesce(_reason,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'A failure reason is required'; END IF;
 SELECT * INTO _payment FROM public.payments WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR _payment.reversed OR _payment.failed THEN RAISE EXCEPTION 'Payment missing, reversed or already failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.payment_allocations WHERE payment_id=_id AND NOT reversed) THEN RAISE EXCEPTION 'Reverse the payment instead; it has allocations'; END IF;
 UPDATE public.payments SET failed=true, failure_reason=trim(_reason) WHERE id=_id;
END $f$;

REVOKE ALL ON FUNCTION public.create_invoice(uuid,date,jsonb,text,uuid), public.issue_credit_note(uuid,numeric,text), public.mark_payment_failed(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice(uuid,date,jsonb,text,uuid), public.issue_credit_note(uuid,numeric,text), public.mark_payment_failed(uuid,text) TO authenticated;