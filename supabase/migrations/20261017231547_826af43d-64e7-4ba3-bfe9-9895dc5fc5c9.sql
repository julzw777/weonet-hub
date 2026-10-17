REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.staff_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, public.staff_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.staff_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.staff_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
REVOKE ALL ON public.staff_profiles, public.user_roles, public.app_settings, public.audit_logs, public.locations, public.customers, public.service_plans, public.subscriptions FROM anon;