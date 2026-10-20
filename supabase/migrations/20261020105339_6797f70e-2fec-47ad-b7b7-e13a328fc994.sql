CREATE TABLE public.usage_samples (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  bucket_start timestamptz NOT NULL,
  rx_bytes numeric NOT NULL DEFAULT 0 CHECK (rx_bytes >= 0),
  tx_bytes numeric NOT NULL DEFAULT 0 CHECK (tx_bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, bucket_start)
);

CREATE INDEX usage_samples_sub_time ON public.usage_samples (subscription_id, bucket_start DESC);

GRANT SELECT ON public.usage_samples TO authenticated;
GRANT ALL ON public.usage_samples TO service_role;

ALTER TABLE public.usage_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view usage" ON public.usage_samples FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','noc','tech','care','readonly']::staff_role[]));

-- Rollup function: hourly/daily/monthly/yearly buckets for a service over a range.
CREATE OR REPLACE FUNCTION public.usage_series(_subscription_id uuid, _granularity text, _from timestamptz, _to timestamptz)
RETURNS TABLE(bucket_start timestamptz, rx_bytes numeric, tx_bytes numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','noc','tech','care','readonly']::staff_role[]) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;
  IF _granularity NOT IN ('hour','day','month','year') THEN
    RAISE EXCEPTION 'granularity must be hour, day, month or year';
  END IF;
  IF _to <= _from OR _to - _from > interval '3 years' THEN
    RAISE EXCEPTION 'invalid range';
  END IF;
  RETURN QUERY
    SELECT date_trunc(_granularity, s.bucket_start) AS bucket_start,
           sum(s.rx_bytes) AS rx_bytes,
           sum(s.tx_bytes) AS tx_bytes
    FROM public.usage_samples s
    WHERE s.subscription_id = _subscription_id
      AND s.bucket_start >= _from AND s.bucket_start < _to
    GROUP BY 1
    ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.usage_series(uuid,text,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usage_series(uuid,text,timestamptz,timestamptz) TO authenticated;