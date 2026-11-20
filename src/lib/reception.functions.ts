import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listAppointments = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("id, patient_name, phone, symptoms, status, language, created_at, doctors(full_name, specialty_ru, room), schedule_slots(slot_date, slot_time)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const cancelFromReception = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ appointment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { cancelBooking } = await import("@/lib/clinic.server");
    return cancelBooking(data);
  });

export const bookFromReception = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ slot_id: z.string().uuid(), patient_name: z.string().min(2).max(120), phone: z.string().min(5).max(30), symptoms: z.string().max(1000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { createBooking } = await import("@/lib/clinic.server");
    return createBooking({ ...data, language: "ru" });
  });
