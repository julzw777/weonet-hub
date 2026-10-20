CREATE POLICY "Admins can delete tickets" ON public.tickets FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Warehouse and admin can delete items" ON public.inventory_items FOR DELETE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['warehouse','admin']::staff_role[]));

CREATE POLICY "NOC and admin can delete devices" ON public.network_devices FOR DELETE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['noc','admin']::staff_role[]));