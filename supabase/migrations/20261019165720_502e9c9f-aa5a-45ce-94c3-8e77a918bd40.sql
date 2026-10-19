DO $$
DECLARE actor uuid; customer uuid; invoice uuid; payment uuid; second uuid; value numeric;
BEGIN
 SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'An existing admin is required to run billing checks'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  BEGIN
   PERFORM public.create_invoice(gen_random_uuid(),CURRENT_DATE,'[]');
   RAISE EXCEPTION 'Unauthorized billing writer was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  INSERT INTO public.customers(full_name) VALUES ('__billing_regression_fixture__') RETURNING id INTO customer;
  invoice:=public.create_invoice(customer,CURRENT_DATE,'[{"description":"Service","quantity":1,"unit_price":100}]');
  SELECT total INTO value FROM public.invoices WHERE id=invoice;
  IF value<>100 THEN RAISE EXCEPTION 'Incorrect invoice total'; END IF;
  payment:=public.record_payment(customer,'bank_transfer','__TEST-'||gen_random_uuid()::text,150,CURRENT_DATE);
  BEGIN
   PERFORM public.allocate_payment(payment,invoice,100);
   RAISE EXCEPTION 'Draft accepted payment';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Draft accepted payment' THEN RAISE; END IF; END;
  PERFORM public.set_invoice_state(invoice,'issued');
  PERFORM public.allocate_payment(payment,invoice,100);
  BEGIN
   PERFORM public.allocate_payment(payment,invoice,1);
   RAISE EXCEPTION 'Over-allocation accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Over-allocation accepted' THEN RAISE; END IF; END;
  BEGIN
   PERFORM public.record_payment(customer,'bank_transfer',(SELECT lower(reference) FROM public.payments WHERE id=payment),150,CURRENT_DATE);
   RAISE EXCEPTION 'Duplicate accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Duplicate accepted' THEN RAISE; END IF; END;
  BEGIN
   PERFORM public.set_invoice_state(invoice,'void');
   RAISE EXCEPTION 'Paid invoice void accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Paid invoice void accepted' THEN RAISE; END IF; END;
  SELECT amount-(SELECT sum(amount) FROM public.payment_allocations WHERE payment_id=payment AND NOT reversed) INTO value FROM public.payments WHERE id=payment;
  IF value<>50 THEN RAISE EXCEPTION 'Excess payment lost'; END IF;
  PERFORM public.reverse_payment(payment,'Regression test');
  IF EXISTS(SELECT 1 FROM public.payment_allocations WHERE payment_id=payment AND NOT reversed) THEN RAISE EXCEPTION 'Reversal did not restore balance'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE entity='payments' AND entity_id=payment::text AND action='update' AND actor_id=actor) THEN RAISE EXCEPTION 'Missing payment audit'; END IF;
  PERFORM public.set_invoice_state(invoice,'void');
  RAISE EXCEPTION '__TEST_ROLLBACK_SUCCESS__';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'__TEST_ROLLBACK_SUCCESS__' THEN RAISE; END IF;
 END;
END $$;