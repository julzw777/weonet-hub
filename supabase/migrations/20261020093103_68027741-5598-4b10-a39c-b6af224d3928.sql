REVOKE ALL ON public.invoice_reminders FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.invoice_reminders FROM authenticated;
GRANT SELECT ON public.invoice_reminders TO authenticated;