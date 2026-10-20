REVOKE ALL ON public.tickets, public.inventory_items, public.equipment_loans, public.stock_movements FROM anon;
REVOKE ALL ON SEQUENCE public.ticket_number_seq FROM anon;