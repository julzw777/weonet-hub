CREATE TABLE public.network_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vendor text NOT NULL DEFAULT 'mikrotik',
  model text,
  kind text NOT NULL DEFAULT 'router',
  endpoint_ref text NOT NULL UNIQUE,
  location_id uuid REFERENCES public.locations(id),
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  last_health_status text NOT NULL DEFAULT 'never_checked',
  last_health_at timestamptz,
  last_health_detail text,
  routeros_version text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.network_devices TO authenticated;
GRANT ALL ON public.network_devices TO service_role;
ALTER TABLE public.network_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Network staff read devices" ON public.network_devices FOR SELECT TO authenticated
 USING (public.has_any_role(auth.uid(), ARRAY['admin','noc','tech','readonly']::staff_role[]));
CREATE POLICY "NOC/Admin add devices" ON public.network_devices FOR INSERT TO authenticated
 WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','noc']::staff_role[]));
CREATE POLICY "NOC/Admin edit devices" ON public.network_devices FOR UPDATE TO authenticated
 USING (public.has_any_role(auth.uid(), ARRAY['admin','noc']::staff_role[]))
 WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','noc']::staff_role[]));
CREATE INDEX network_devices_location_idx ON public.network_devices(location_id);

CREATE OR REPLACE FUNCTION public.validate_network_device() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE svc boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
BEGIN
  IF length(trim(NEW.name)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Device name must be 1-120 characters'; END IF;
  IF NEW.vendor <> 'mikrotik' THEN RAISE EXCEPTION 'Only MikroTik devices are supported'; END IF;
  IF NEW.kind NOT IN ('router','switch','olt','ap') THEN RAISE EXCEPTION 'Invalid device kind'; END IF;
  IF NEW.endpoint_ref !~ '^[A-Z][A-Z0-9_]{1,39}$' THEN RAISE EXCEPTION 'Connection reference must be 2-40 uppercase letters, digits or underscores'; END IF;
  IF length(coalesce(NEW.model,'')) > 120 OR length(coalesce(NEW.notes,'')) > 1000 THEN RAISE EXCEPTION 'Text too long'; END IF;
  IF NOT svc THEN
    IF TG_OP = 'INSERT' THEN
      NEW.last_health_status := 'never_checked'; NEW.last_health_at := NULL; NEW.last_health_detail := NULL; NEW.routeros_version := NULL; NEW.created_by := auth.uid();
    ELSE
      NEW.last_health_status := OLD.last_health_status; NEW.last_health_at := OLD.last_health_at; NEW.last_health_detail := OLD.last_health_detail; NEW.routeros_version := OLD.routeros_version; NEW.created_by := OLD.created_by;
      IF NEW.endpoint_ref <> OLD.endpoint_ref THEN NEW.last_health_status := 'never_checked'; NEW.last_health_at := NULL; NEW.last_health_detail := NULL; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER network_devices_validate BEFORE INSERT OR UPDATE ON public.network_devices FOR EACH ROW EXECUTE FUNCTION public.validate_network_device();
CREATE TRIGGER network_devices_updated BEFORE UPDATE ON public.network_devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER network_devices_audit AFTER INSERT OR UPDATE OR DELETE ON public.network_devices FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE TABLE public.router_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.network_devices(id),
  action text NOT NULL,
  dry_run boolean NOT NULL DEFAULT true,
  status text NOT NULL,
  detail text,
  idempotency_key text NOT NULL,
  requested_by uuid NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requested_by, idempotency_key)
);
GRANT SELECT ON public.router_actions TO authenticated;
GRANT ALL ON public.router_actions TO service_role;
ALTER TABLE public.router_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "NOC/Admin read router actions" ON public.router_actions FOR SELECT TO authenticated
 USING (public.has_any_role(auth.uid(), ARRAY['admin','noc']::staff_role[]));
CREATE INDEX router_actions_device_idx ON public.router_actions(device_id, created_at DESC);
CREATE TRIGGER router_actions_updated BEFORE UPDATE ON public.router_actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER router_actions_audit AFTER INSERT OR UPDATE OR DELETE ON public.router_actions FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

REVOKE ALL ON public.network_devices FROM anon;
REVOKE ALL ON public.router_actions FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_network_device() FROM PUBLIC, anon, authenticated;