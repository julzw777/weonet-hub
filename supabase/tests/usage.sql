-- Rollback test for usage_samples + usage_series. Run wrapped in a transaction and roll back.
BEGIN;

-- Setup: a customer, plan, subscription
INSERT INTO public.customers (account_number, full_name, customer_type, status)
VALUES ('T-USG-1', 'Usage Test', 'residential', 'active') RETURNING id \gset
INSERT INTO public.service_plans (name, technology, download_mbps, upload_mbps, monthly_price)
VALUES ('Usage Test Plan', 'fiber', 10, 5, 100) RETURNING id \gset
INSERT INTO public.subscriptions (customer_id, plan_id, status)
VALUES (:id, :id, 'active') RETURNING id \gset

DO $$
DECLARE
  sub uuid := (SELECT id FROM public.subscriptions WHERE customer_id = (SELECT id FROM public.customers WHERE account_number = 'T-USG-1'));
  rows int;
BEGIN
  -- 1. Staff cannot insert usage rows directly (RLS: no INSERT policy for authenticated)
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.usage_samples (subscription_id, bucket_start, rx_bytes, tx_bytes)
    VALUES (sub, now(), 100, 50);
    RAISE EXCEPTION 'staff insert should have been blocked';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM = 'staff insert should have been blocked' THEN RAISE; END IF;
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

  -- 4. Hourly rollup returns raw buckets
  SELECT count(*) INTO rows FROM public.usage_series(sub, 'hour', '2026-10-19 00:00+00', '2026-10-21 00:00+00');
  IF rows <> 3 THEN RAISE EXCEPTION 'hourly rollup expected 3 rows, got %', rows; END IF;

  -- 5. Daily rollup groups two same-day buckets
  SELECT count(*) INTO rows FROM public.usage_series(sub, 'day', '2026-10-19 00:00+00', '2026-10-21 00:00+00');
  IF rows <> 2 THEN RAISE EXCEPTION 'daily rollup expected 2 rows, got %', rows; END IF;
  IF (SELECT rx_bytes FROM public.usage_series(sub, 'day', '2026-10-19 00:00+00', '2026-10-21 00:00+00') ORDER BY bucket_start LIMIT 1) <> 4000
    THEN RAISE EXCEPTION 'daily rx sum wrong'; END IF;

  -- 6. Bad granularity rejected
  BEGIN
    PERFORM * FROM public.usage_series(sub, 'minute', '2026-10-19 00:00+00', '2026-10-21 00:00+00');
    RAISE EXCEPTION 'bad granularity should have been rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'granularity must be hour, day, month or year' THEN RAISE; END IF;
  END;

  -- 7. Reversed range rejected
  BEGIN
    PERFORM * FROM public.usage_series(sub, 'day', '2026-10-21 00:00+00', '2026-10-19 00:00+00');
    RAISE EXCEPTION 'bad range should have been rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid range' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
