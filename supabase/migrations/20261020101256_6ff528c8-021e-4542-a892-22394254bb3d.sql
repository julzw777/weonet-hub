CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq;

CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE DEFAULT ('TKT-' || lpad(nextval('public.ticket_number_seq')::text, 5, '0')),
  customer_id uuid REFERENCES public.customers(id),
  subject text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'support',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  created_by uuid DEFAULT auth.uid(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
GRANT USAGE ON SEQUENCE public.ticket_number_seq TO authenticated, service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ticket staff read" ON public.tickets FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','care','tech','noc','readonly']::public.staff_role[]));
CREATE POLICY "Ticket staff create" ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','care','tech','noc']::public.staff_role[]));
CREATE POLICY "Ticket staff update" ON public.tickets FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','care','tech','noc']::public.staff_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','care','tech','noc']::public.staff_role[]));
CREATE INDEX tickets_status_idx ON public.tickets(status);
CREATE INDEX tickets_customer_idx ON public.tickets(customer_id);

CREATE OR REPLACE FUNCTION public.validate_ticket() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF length(trim(coalesce(NEW.subject,''))) = 0 OR length(NEW.subject) > 200 THEN RAISE EXCEPTION 'Subject is required (max 200 characters)'; END IF;
  IF NEW.priority NOT IN ('low','medium','high','urgent') THEN RAISE EXCEPTION 'Invalid priority'; END IF;
  IF NEW.status NOT IN ('open','in_progress','pending','resolved','closed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF NEW.category NOT IN ('support','installation','billing','outage','other') THEN RAISE EXCEPTION 'Invalid category'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN RAISE EXCEPTION 'Closed tickets cannot be reopened; open a new ticket'; END IF;
    NEW.number := OLD.number; NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at;
  END IF;
  IF NEW.status IN ('resolved','closed') AND NEW.resolved_at IS NULL THEN NEW.resolved_at := now(); END IF;
  IF NEW.status NOT IN ('resolved','closed') THEN NEW.resolved_at := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tickets_validate BEFORE INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.validate_ticket();
CREATE TRIGGER tickets_updated BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tickets_audit AFTER INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  unit text NOT NULL DEFAULT 'pcs',
  loanable boolean NOT NULL DEFAULT false,
  reorder_level numeric NOT NULL DEFAULT 0,
  stock_qty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inventory read" ON public.inventory_items FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','warehouse','tech','readonly']::public.staff_role[]));
CREATE POLICY "Inventory create" ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','warehouse']::public.staff_role[]));
CREATE POLICY "Inventory update" ON public.inventory_items FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','warehouse']::public.staff_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','warehouse']::public.staff_role[]));

CREATE OR REPLACE FUNCTION public.validate_inventory_item() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF length(trim(coalesce(NEW.name,''))) = 0 OR length(trim(coalesce(NEW.sku,''))) = 0 THEN RAISE EXCEPTION 'SKU and name are required'; END IF;
  IF NEW.category NOT IN ('cable','router','ont','onu','connector','consumable','other') THEN RAISE EXCEPTION 'Invalid category'; END IF;
  IF NEW.reorder_level < 0 THEN RAISE EXCEPTION 'Reorder level cannot be negative'; END IF;
  IF coalesce(current_setting('weonet.stock_move', true),'') <> 'on' THEN
    IF TG_OP = 'INSERT' THEN NEW.stock_qty := 0; ELSE NEW.stock_qty := OLD.stock_qty; END IF;
  END IF;
  IF NEW.stock_qty < 0 THEN RAISE EXCEPTION 'Not enough stock'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_validate BEFORE INSERT OR UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_item();
CREATE TRIGGER inventory_updated BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER inventory_audit AFTER INSERT OR UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE TABLE public.equipment_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  serial text NOT NULL,
  status text NOT NULL DEFAULT 'on_loan',
  condition text,
  loaned_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX equipment_loans_serial_active ON public.equipment_loans(item_id, serial) WHERE status = 'on_loan';
GRANT SELECT ON public.equipment_loans TO authenticated;
GRANT ALL ON public.equipment_loans TO service_role;
ALTER TABLE public.equipment_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Loans read" ON public.equipment_loans FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','warehouse','tech','care','readonly']::public.staff_role[]));
CREATE TRIGGER loans_updated BEFORE UPDATE ON public.equipment_loans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER loans_audit AFTER INSERT OR UPDATE ON public.equipment_loans FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id),
  kind text NOT NULL,
  quantity numeric NOT NULL,
  customer_id uuid REFERENCES public.customers(id),
  ticket_id uuid REFERENCES public.tickets(id),
  loan_id uuid REFERENCES public.equipment_loans(id),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_item_idx ON public.stock_movements(item_id);
CREATE INDEX stock_movements_customer_idx ON public.stock_movements(customer_id);
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Movements read" ON public.stock_movements FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','warehouse','tech','care','readonly']::public.staff_role[]));
CREATE TRIGGER movements_audit AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- internal helper: apply a delta under row lock
CREATE OR REPLACE FUNCTION public._move_stock(_item uuid, _kind text, _delta numeric, _customer uuid, _ticket uuid, _loan uuid, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _qty numeric; _id uuid;
BEGIN
  SELECT stock_qty INTO _qty FROM public.inventory_items WHERE id = _item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown item'; END IF;
  IF _qty + _delta < 0 THEN RAISE EXCEPTION 'Not enough stock (on hand: %)', _qty; END IF;
  PERFORM set_config('weonet.stock_move', 'on', true);
  UPDATE public.inventory_items SET stock_qty = stock_qty + _delta WHERE id = _item;
  PERFORM set_config('weonet.stock_move', 'off', true);
  INSERT INTO public.stock_movements(item_id, kind, quantity, customer_id, ticket_id, loan_id, note, created_by)
  VALUES (_item, _kind, _delta, _customer, _ticket, _loan, nullif(trim(_note),''), auth.uid()) RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public._move_stock(uuid,text,numeric,uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.adjust_stock(_item_id uuid, _quantity numeric, _kind text, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(), ARRAY['admin','warehouse']::public.staff_role[]) THEN RAISE EXCEPTION 'Only Warehouse or Admin can change stock' USING ERRCODE='42501'; END IF;
  IF _kind = 'receive' THEN
    IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  ELSIF _kind = 'adjust' THEN
    IF _quantity IS NULL OR _quantity = 0 THEN RAISE EXCEPTION 'Adjustment cannot be zero'; END IF;
    IF length(trim(coalesce(_note,''))) < 3 THEN RAISE EXCEPTION 'A reason is required for adjustments'; END IF;
  ELSE RAISE EXCEPTION 'Invalid movement type'; END IF;
  RETURN public._move_stock(_item_id, _kind, _quantity, NULL, NULL, NULL, _note);
END $$;

CREATE OR REPLACE FUNCTION public.record_supply_usage(_item_id uuid, _customer_id uuid, _quantity numeric, _ticket_id uuid, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(), ARRAY['admin','warehouse','tech']::public.staff_role[]) THEN RAISE EXCEPTION 'Only Tech, Warehouse or Admin can record supplies used' USING ERRCODE='42501'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer_id) THEN RAISE EXCEPTION 'Unknown customer'; END IF;
  IF _ticket_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tickets WHERE id = _ticket_id AND (customer_id IS NULL OR customer_id = _customer_id)) THEN RAISE EXCEPTION 'Ticket does not belong to this customer'; END IF;
  RETURN public._move_stock(_item_id, 'usage', -_quantity, _customer_id, _ticket_id, NULL, _note);
END $$;

CREATE OR REPLACE FUNCTION public.loan_equipment(_item_id uuid, _customer_id uuid, _serial text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _loan uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(), ARRAY['admin','warehouse','tech']::public.staff_role[]) THEN RAISE EXCEPTION 'Only Tech, Warehouse or Admin can loan equipment' USING ERRCODE='42501'; END IF;
  IF length(trim(coalesce(_serial,''))) = 0 THEN RAISE EXCEPTION 'Serial number is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id = _item_id AND loanable) THEN RAISE EXCEPTION 'This item cannot be loaned'; END IF;
  IF EXISTS (SELECT 1 FROM public.equipment_loans WHERE item_id = _item_id AND serial = trim(_serial) AND status = 'on_loan') THEN RAISE EXCEPTION 'That serial is already on loan'; END IF;
  INSERT INTO public.equipment_loans(item_id, customer_id, serial, recorded_by) VALUES (_item_id, _customer_id, trim(_serial), auth.uid()) RETURNING id INTO _loan;
  PERFORM public._move_stock(_item_id, 'loan_out', -1, _customer_id, NULL, _loan, 'Serial ' || trim(_serial));
  RETURN _loan;
END $$;

CREATE OR REPLACE FUNCTION public.return_equipment(_loan_id uuid, _outcome text, _condition text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l public.equipment_loans;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(), ARRAY['admin','warehouse','tech']::public.staff_role[]) THEN RAISE EXCEPTION 'Only Tech, Warehouse or Admin can return equipment' USING ERRCODE='42501'; END IF;
  SELECT * INTO _l FROM public.equipment_loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND OR _l.status <> 'on_loan' THEN RAISE EXCEPTION 'Loan is not active'; END IF;
  IF _outcome NOT IN ('returned','lost') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  UPDATE public.equipment_loans SET status = _outcome, condition = nullif(trim(_condition),''), returned_at = now() WHERE id = _loan_id;
  IF _outcome = 'returned' AND coalesce(_condition,'') <> 'damaged' THEN
    PERFORM public._move_stock(_l.item_id, 'loan_return', 1, _l.customer_id, NULL, _loan_id, 'Serial ' || _l.serial);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.adjust_stock(uuid,numeric,text,text), public.record_supply_usage(uuid,uuid,numeric,uuid,text),
  public.loan_equipment(uuid,uuid,text), public.return_equipment(uuid,text,text), public.validate_ticket(), public.validate_inventory_item() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid,numeric,text,text), public.record_supply_usage(uuid,uuid,numeric,uuid,text),
  public.loan_equipment(uuid,uuid,text), public.return_equipment(uuid,text,text) TO authenticated;