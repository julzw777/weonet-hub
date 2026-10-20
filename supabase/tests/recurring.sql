-- Rollback-only checks: preview authorization, month-start periods, generation gate,
-- correct draft totals/due date, and one invoice per service per period.
-- (Same block that was run against the connected database on 2026-10-20.)
DO $$
DECLARE actor uuid; cust uuid; plan uuid; sub uuid; ps date := date_trunc('month', current_date)::date;
BEGIN
 SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' LIMIT 1;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  BEGIN PERFORM * FROM public.preview_recurring_invoices(ps); RAISE EXCEPTION 'Unauthorized preview accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  INSERT INTO public.customers(full_name) VALUES ('__rec_test__') RETURNING id INTO cust;
  INSERT INTO public.service_plans(name,download_mbps,upload_mbps,monthly_price) VALUES ('__plan__',10,10,250) RETURNING id INTO plan;
  INSERT INTO public.subscriptions(customer_id,plan_id,status) VALUES (cust,plan,'pending') RETURNING id INTO sub;
  UPDATE public.subscriptions SET status='active' WHERE id=sub;
  IF NOT EXISTS (SELECT 1 FROM public.preview_recurring_invoices(ps) WHERE subscription_id=sub AND amount=250 AND NOT already_invoiced) THEN RAISE EXCEPTION 'Preview missing service'; END IF;
  BEGIN PERFORM * FROM public.preview_recurring_invoices(ps + 3); RAISE EXCEPTION 'Mid-month period accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Mid-month period accepted' THEN RAISE; END IF; END;
  UPDATE public.app_settings SET currency_confirmed=false, recurring_cadence=NULL, recurring_due_days=NULL WHERE id=1;
  BEGIN PERFORM public.generate_recurring_invoices(ps); RAISE EXCEPTION 'Unconfigured generation accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Unconfigured generation accepted' THEN RAISE; END IF; END;
  UPDATE public.app_settings SET currency_confirmed=true, recurring_cadence='monthly', recurring_due_days=14 WHERE id=1;
  PERFORM public.generate_recurring_invoices(ps);
  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE subscription_id=sub AND period_start=ps AND state='draft' AND total=250 AND due_date=ps+14) THEN RAISE EXCEPTION 'Recurring draft wrong'; END IF;
  PERFORM public.generate_recurring_invoices(ps);
  IF (SELECT count(*) FROM public.invoices WHERE subscription_id=sub AND period_start=ps) <> 1 THEN RAISE EXCEPTION 'Duplicate recurring invoice'; END IF;
  RAISE EXCEPTION '__TEST_ROLLBACK_SUCCESS__';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'__TEST_ROLLBACK_SUCCESS__' THEN RAISE; END IF;
 END;
END $$;
