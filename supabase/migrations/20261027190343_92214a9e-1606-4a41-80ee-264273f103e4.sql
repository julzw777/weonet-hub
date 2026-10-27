ALTER TABLE public.staff_profiles ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.complete_password_change()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.staff_profiles
  SET must_change_password = false, updated_at = now()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_password_change() TO authenticated;