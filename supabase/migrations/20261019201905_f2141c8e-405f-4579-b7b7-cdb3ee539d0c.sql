REVOKE ALL ON public.credit_notes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.credit_notes FROM authenticated;