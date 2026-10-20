-- Rollback-only checks for the router registry.
DO $$
DECLARE actor uuid; dev uuid; st text;
BEGIN
 SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'An existing admin is required'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',actor,'role','authenticated')::text, true);
  INSERT INTO public.network_devices(name,endpoint_ref,last_health_status) VALUES ('__test__','TEST_CORE','healthy') RETURNING id INTO dev;
  SELECT last_health_status INTO st FROM public.network_devices WHERE id=dev;
  IF st<>'never_checked' THEN RAISE EXCEPTION 'Staff forged health status'; END IF;
  UPDATE public.network_devices SET last_health_status='healthy' WHERE id=dev;
  SELECT last_health_status INTO st FROM public.network_devices WHERE id=dev;
  IF st<>'never_checked' THEN RAISE EXCEPTION 'Staff forged health on update'; END IF;
  BEGIN INSERT INTO public.network_devices(name,endpoint_ref) VALUES ('x','http://evil'); RAISE EXCEPTION 'Bad ref accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Bad ref accepted' THEN RAISE; END IF; END;
  IF NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE entity='network_devices' AND entity_id=dev::text) THEN RAISE EXCEPTION 'Missing device audit'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  INSERT INTO public.router_actions(device_id,action,status,idempotency_key,requested_by) VALUES (dev,'health_check','unconfigured','key-12345',actor);
  BEGIN INSERT INTO public.router_actions(device_id,action,status,idempotency_key,requested_by) VALUES (dev,'health_check','unconfigured','key-12345',actor); RAISE EXCEPTION 'Duplicate idempotency key accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  UPDATE public.network_devices SET last_health_status='unconfigured' WHERE id=dev;
  SELECT last_health_status INTO st FROM public.network_devices WHERE id=dev;
  IF st<>'unconfigured' THEN RAISE EXCEPTION 'Service could not record health'; END IF;
  RAISE EXCEPTION '__TEST_ROLLBACK_SUCCESS__';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'__TEST_ROLLBACK_SUCCESS__' THEN RAISE; END IF;
 END;
END $$;
