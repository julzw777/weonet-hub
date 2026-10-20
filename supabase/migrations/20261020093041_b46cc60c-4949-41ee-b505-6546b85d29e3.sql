CREATE TABLE public.invoice_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  channel text NOT NULL,
  recipient text,
  status text NOT NULL DEFAULT 'logged',
  note text,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invoice_reminders TO authenticated;
GRANT ALL ON public.invoice_reminders TO service_role;
ALTER TABLE public.invoice_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Billing readers" ON public.invoice_reminders FOR SELECT TO authenticated
 USING (public.has_any_role(auth.uid(), ARRAY['admin','finance','care','readonly']::staff_role[]));
CREATE INDEX invoice_reminders_invoice_idx ON public.invoice_reminders(invoice_id);
CREATE TRIGGER invoice_reminders_updated BEFORE UPDATE ON public.invoice_reminders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER invoice_reminders_audit AFTER INSERT OR UPDATE OR DELETE ON public.invoice_reminders FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE OR REPLACE FUNCTION public.log_invoice_reminder(_invoice_id uuid, _channel text, _recipient text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st text; rid uuid;
BEGIN
  PERFORM public.require_billing_writer();
  IF _channel NOT IN ('email','sms','phone','whatsapp','in_person','letter') THEN RAISE EXCEPTION 'Invalid reminder channel'; END IF;
  IF length(coalesce(_recipient,''))>200 OR length(coalesce(_note,''))>1000 THEN RAISE EXCEPTION 'Reminder text too long'; END IF;
  SELECT state INTO st FROM public.invoices WHERE id=_invoice_id;
  IF st IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF st<>'issued' THEN RAISE EXCEPTION 'Reminders can only be logged for issued invoices'; END IF;
  INSERT INTO public.invoice_reminders(invoice_id,channel,recipient,note,recorded_by)
  VALUES (_invoice_id,_channel,nullif(trim(_recipient),''),nullif(trim(_note),''),auth.uid()) RETURNING id INTO rid;
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.set_reminder_status(_id uuid, _status text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur text;
BEGIN
  PERFORM public.require_billing_writer();
  SELECT status INTO cur FROM public.invoice_reminders WHERE id=_id FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'Reminder not found'; END IF;
  IF NOT ((cur='logged' AND _status IN ('sent','failed')) OR (cur='sent' AND _status IN ('delivered','failed'))) THEN
    RAISE EXCEPTION 'Cannot change reminder from % to %', cur, _status; END IF;
  IF _status='failed' AND coalesce(trim(_reason),'')='' THEN RAISE EXCEPTION 'A failure reason is required'; END IF;
  UPDATE public.invoice_reminders SET status=_status,
    sent_at = CASE WHEN _status='sent' THEN now() ELSE sent_at END,
    delivered_at = CASE WHEN _status='delivered' THEN now() ELSE delivered_at END,
    failed_at = CASE WHEN _status='failed' THEN now() ELSE failed_at END,
    failure_reason = CASE WHEN _status='failed' THEN left(trim(_reason),500) ELSE failure_reason END
  WHERE id=_id;
END $$;

REVOKE ALL ON FUNCTION public.log_invoice_reminder(uuid,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_reminder_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_invoice_reminder(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_reminder_status(uuid,text,text) TO authenticated;