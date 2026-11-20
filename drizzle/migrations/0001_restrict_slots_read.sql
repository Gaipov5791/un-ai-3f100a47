DROP POLICY IF EXISTS "public read slots" ON public.schedule_slots;
CREATE POLICY "public read upcoming slots" ON public.schedule_slots
  FOR SELECT TO anon, authenticated
  USING (slot_date >= current_date AND slot_date <= current_date + 30);