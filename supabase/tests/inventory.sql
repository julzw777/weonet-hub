-- Rollback-only checks for tickets, stock, loans and supply usage.
DO $$
DECLARE actor uuid; cust uuid; item uuid; loan uuid; tkt uuid; q numeric;
BEGIN
 SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'An existing admin is required'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',actor,'role','authenticated')::text, true);
  INSERT INTO public.customers(account_number, full_name, customer_type, status) VALUES ('__T1','Test Cust','residential','active') RETURNING id INTO cust;
  INSERT INTO public.inventory_items(sku,name,category,loanable,stock_qty) VALUES ('__SKU','ONT test','ont',true,99) RETURNING id INTO item;
  SELECT stock_qty INTO q FROM public.inventory_items WHERE id=item; IF q<>0 THEN RAISE EXCEPTION 'Stock forged on insert'; END IF;
  UPDATE public.inventory_items SET stock_qty=50 WHERE id=item;
  SELECT stock_qty INTO q FROM public.inventory_items WHERE id=item; IF q<>0 THEN RAISE EXCEPTION 'Stock forged on update'; END IF;
  PERFORM public.adjust_stock(item, 3, 'receive', 'delivery');
  INSERT INTO public.tickets(subject, customer_id) VALUES ('Install', cust) RETURNING id INTO tkt;
  PERFORM public.record_supply_usage(item, cust, 1, tkt, 'install');
  BEGIN PERFORM public.record_supply_usage(item, cust, 5, NULL, ''); RAISE EXCEPTION 'Overdraw accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Overdraw accepted' THEN RAISE; END IF; END;
  loan := public.loan_equipment(item, cust, 'SN1');
  BEGIN PERFORM public.loan_equipment(item, cust, 'SN1'); RAISE EXCEPTION 'Duplicate serial accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Duplicate serial accepted' THEN RAISE; END IF; END;
  SELECT stock_qty INTO q FROM public.inventory_items WHERE id=item; IF q<>1 THEN RAISE EXCEPTION 'Expected 1 on hand, got %', q; END IF;
  PERFORM public.return_equipment(loan, 'returned', 'good');
  SELECT stock_qty INTO q FROM public.inventory_items WHERE id=item; IF q<>2 THEN RAISE EXCEPTION 'Return not restocked'; END IF;
  UPDATE public.tickets SET status='closed' WHERE id=tkt;
  BEGIN UPDATE public.tickets SET status='open' WHERE id=tkt; RAISE EXCEPTION 'Reopen accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Reopen accepted' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM public.stock_movements WHERE item_id=item) <> 4 THEN RAISE EXCEPTION 'Movement history incomplete'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE entity='stock_movements') THEN RAISE EXCEPTION 'Missing audit'; END IF;
  -- non-privileged caller
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gen_random_uuid(),'role','authenticated')::text, true);
  BEGIN PERFORM public.adjust_stock(item, 1, 'receive', ''); RAISE EXCEPTION 'Unauthorized receive accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE EXCEPTION '__TEST_ROLLBACK_SUCCESS__';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'__TEST_ROLLBACK_SUCCESS__' THEN RAISE; END IF;
 END;
END $$;
