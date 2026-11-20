CREATE TABLE public.doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  specialty_ru text NOT NULL,
  specialty_ky text NOT NULL,
  room text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.schedule_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  slot_date date NOT NULL,
  slot_time time NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','booked')),
  UNIQUE (doctor_id, slot_date, slot_time)
);
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name text NOT NULL,
  phone text NOT NULL,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id),
  slot_id uuid NOT NULL REFERENCES public.schedule_slots(id),
  symptoms text,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  language text NOT NULL DEFAULT 'ru',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX appointments_one_active_per_slot ON public.appointments(slot_id) WHERE status = 'confirmed';
CREATE TABLE public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language text NOT NULL DEFAULT 'ru',
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  entities jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.doctors TO anon, authenticated;
GRANT SELECT ON public.schedule_slots TO anon, authenticated;
GRANT ALL ON public.doctors, public.schedule_slots, public.appointments, public.call_logs TO service_role;

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read doctors" ON public.doctors FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read slots" ON public.schedule_slots FOR SELECT TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_slots;

INSERT INTO public.doctors (full_name, specialty_ru, specialty_ky, room) VALUES
('Асанова Айгуль Токтогуловна','Терапевт','Терапевт','101'),
('Бекмуратов Нурлан Сапарович','Кардиолог','Кардиолог','204'),
('Жумабаева Чолпон Маратовна','Педиатр','Педиатр','112'),
('Исаков Тимур Эркинович','Невролог','Невролог','305'),
('Касымова Элмира Бакытовна','Гинеколог','Гинеколог','210');
UPDATE public.doctors SET status='vacation' WHERE full_name LIKE 'Исаков%';

INSERT INTO public.schedule_slots (doctor_id, slot_date, slot_time)
SELECT d.id, (current_date + g.day)::date, t.tm::time
FROM public.doctors d
CROSS JOIN generate_series(0,6) AS g(day)
CROSS JOIN unnest(ARRAY['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00']) AS t(tm)
WHERE d.status='active';

CREATE OR REPLACE FUNCTION public.book_slot(_slot_id uuid, _name text, _phone text, _symptoms text, _lang text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _doc uuid; _appt uuid;
BEGIN
  UPDATE schedule_slots SET status='booked' WHERE id=_slot_id AND status='available' RETURNING doctor_id INTO _doc;
  IF _doc IS NULL THEN RAISE EXCEPTION 'SLOT_TAKEN'; END IF;
  INSERT INTO appointments(patient_name, phone, doctor_id, slot_id, symptoms, language)
  VALUES (_name, _phone, _doc, _slot_id, _symptoms, coalesce(_lang,'ru')) RETURNING id INTO _appt;
  RETURN _appt;
END $$;
REVOKE EXECUTE ON FUNCTION public.book_slot FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_slot TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_appointment(_appt_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _slot uuid;
BEGIN
  UPDATE appointments SET status='cancelled' WHERE id=_appt_id AND status='confirmed' RETURNING slot_id INTO _slot;
  IF _slot IS NULL THEN RETURN false; END IF;
  UPDATE schedule_slots SET status='available' WHERE id=_slot;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.cancel_appointment FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment TO service_role;