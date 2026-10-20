-- Rollback test for usage_samples + usage_series. Self-contained; rolls itself back.
BEGIN;

DO $$
DECLARE
  cust uuid; plan uuid; sub uuid; rows int;
BEGIN
  INSERT INTO public.customers (account_number, full_name, customer_type, status)
  VALUES ('T-USG-1', 'Usage Test', 'residential', 'active') RETURNING id INTO cust;
  INSERT INTO public.service_plans (name, technology, download_mbps, upload_mbps, monthly_price)
  VALUES ('Usage Test Plan', 'fiber', 10, 5, 100) RETURNING id INTO plan;
  INSERT INTO public.subscriptions (customer_id, plan_id, status)
  VALUES (cust, plan, 'active') RETURNING id INTO sub;

  -- 1. Authenticated staff cannot insert usage rows directly (no INSERT grant path via RLS)
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.usage_samples (subscription_id, bucket_start, rx_bytes, tx_bytes)
    VALUES (sub, now(), 100, 50);
    RAISE EXCEPTION 'staff insert should have been blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- 2. Service role can insert (collection job path)
  INSERT INTO public.usage_samples (subscription_id, bucket_start, rx_bytes, tx_bytes) VALUES
    (sub, '2026-10-19 10:00+00', 1000, 200),
    (sub, '2026-10-19 11:00+00', 3000, 400),
    (sub, '2026-10-20 10:00+00', 5000, 600);

  -- 3. Duplicate (subscription, bucket) rejected
  BEGIN
    INSERT INTO public.usage_samples (subscription_id, bucket_start, rx_bytes, tx_bytes)
    VALUES (sub, '2026-10-19 10:00+00', 1, 1);
    RAISE EXCEPTION 'duplicate bucket should have been rejected';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Act as a signed-in admin for the rollup checks (replace with any admin user_id)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '106d2818-2c14-4442-8666-07cecfee2721', true);

  -- 4. Hourly rollup returns raw buckets
  SELECT count(*) INTO rows FROM public.usage_series(sub, 'hour', '2026-10-19 00:00+00', '2026-10-21 00:00+00');
  IF rows <> 3 THEN RAISE EXCEPTION 'hourly rollup expected 3 rows, got %', rows; END IF;

  -- 5. Daily rollup groups two same-day buckets and sums correctly
  SELECT count(*) INTO rows FROM public.usage_series(sub, 'day', '2026-10-19 00:00+00', '2026-10-21 00:00+00');
  IF rows <> 2 THEN RAISE EXCEPTION 'daily rollup expected 2 rows, got %', rows; END IF;
  IF (SELECT u.rx_bytes FROM public.usage_series(sub, 'day', '2026-10-19 00:00+00', '2026-10-21 00:00+00') u ORDER BY u.bucket_start LIMIT 1) <> 4000
    THEN RAISE EXCEPTION 'daily rx sum wrong'; END IF;

  -- 6. Monthly rollup groups all into one month
  SELECT count(*) INTO rows FROM public.usage_series(sub, 'month', '2026-10-01 00:00+00', '2026-11-01 00:00+00');
  IF rows <> 1 THEN RAISE EXCEPTION 'monthly rollup expected 1 row, got %', rows; END IF;

  -- 7. Bad granularity rejected
  BEGIN
    PERFORM * FROM public.usage_series(sub, 'minute', '2026-10-19 00:00+00', '2026-10-21 00:00+00');
    RAISE EXCEPTION 'bad granularity should have been rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'granularity must be hour, day, month or year' THEN RAISE; END IF;
  END;

  -- 8. Reversed range rejected
  BEGIN
    PERFORM * FROM public.usage_series(sub, 'day', '2026-10-21 00:00+00', '2026-10-19 00:00+00');
    RAISE EXCEPTION 'bad range should have been rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid range' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
