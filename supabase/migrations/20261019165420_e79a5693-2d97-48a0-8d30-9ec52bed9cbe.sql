REVOKE ALL ON public.invoices, public.invoice_items, public.payments, public.payment_allocations FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.invoices, public.invoice_items, public.payments, public.payment_allocations FROM authenticated;
GRANT SELECT ON public.invoices, public.invoice_items, public.payments, public.payment_allocations TO authenticated;