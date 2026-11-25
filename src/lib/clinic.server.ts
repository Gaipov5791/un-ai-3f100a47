import { z } from "zod";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const availabilityInput = z.object({
  doctor_id: z.string().uuid().optional(),
  specialty: z.string().max(80).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function checkAvailability(input: z.infer<typeof availabilityInput>) {
  const s = await db();
  let dq = s.from("doctors").select("id, full_name, specialty_ru, specialty_ky, room, status").eq("status", "active");
  if (input.doctor_id) dq = dq.eq("id", input.doctor_id);
  if (input.specialty) dq = dq.or(`specialty_ru.ilike.%${input.specialty.replace(/[,%()]/g, "")}%,specialty_ky.ilike.%${input.specialty.replace(/[,%()]/g, "")}%`);
  const { data: doctors, error } = await dq;
  if (error) throw error;
  if (!doctors?.length) return { doctors: [], slots: [] };
  const today = new Date().toISOString().slice(0, 10);
  let sq = s
    .from("schedule_slots")
    .select("id, doctor_id, slot_date, slot_time")
    .eq("status", "available")
    .in("doctor_id", doctors.map((d) => d.id))
    .order("slot_date")
    .order("slot_time")
    .limit(40);
  sq = input.date ? sq.eq("slot_date", input.date) : sq.gte("slot_date", today);
  const { data: slots, error: e2 } = await sq;
  if (e2) throw e2;
  return { doctors, slots: (slots ?? []).map((x) => ({ ...x, slot_time: x.slot_time.slice(0, 5) })) };
}

export const bookingInput = z.object({
  slot_id: z.string().uuid(),
  patient_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(30),
  symptoms: z.string().max(1000).optional(),
  language: z.enum(["kk", "ru"]).optional(),
});

export async function createBooking(input: z.infer<typeof bookingInput>) {
  const s = await db();
  const { data, error } = await s.rpc("book_slot", {
    _slot_id: input.slot_id,
    _name: input.patient_name,
    _phone: input.phone,
    _symptoms: input.symptoms ?? "",
    _lang: input.language ?? "ru",
  });
  if (error) {
    if (error.message.includes("SLOT_TAKEN") || error.code === "23505")
      return { ok: false as const, error: "slot_taken" };
    throw error;
  }
  return { ok: true as const, appointment_id: data as string };
}

export const cancelInput = z.object({ appointment_id: z.string().uuid() });
export const publicCancelInput = z.object({ appointment_id: z.string().uuid(), phone: z.string().trim().min(5).max(30) });

const normPhone = (p: string) => p.replace(/\D/g, "");

export async function cancelBookingVerified(input: z.infer<typeof publicCancelInput>) {
  const s = await db();
  const { data } = await s.from("appointments").select("phone").eq("id", input.appointment_id).eq("status", "confirmed").maybeSingle();
  if (!data || normPhone(data.phone) !== normPhone(input.phone)) return { ok: false };
  return cancelBooking({ appointment_id: input.appointment_id });
}

export async function cancelBooking(input: z.infer<typeof cancelInput>) {
  const s = await db();
  const { data, error } = await s.rpc("cancel_appointment", { _appt_id: input.appointment_id });
  if (error) throw error;
  return { ok: Boolean(data) };
}

export async function findAppointmentsVerified(phone: string, name: string) {
  const s = await db();
  const { data } = await s
    .from("appointments")
    .select("id, patient_name, phone, schedule_slots(slot_date, slot_time), doctors(full_name)")
    .eq("status", "confirmed");
  const n = name.trim().toLowerCase();
  const p = normPhone(phone);
  return (data ?? [])
    .filter((a) => normPhone(a.phone) === p && p.length >= 5 && a.patient_name.toLowerCase().includes(n) && n.length >= 2)
    .map(({ id, schedule_slots, doctors }) => ({ id, schedule_slots, doctors }));
}

export async function logCall(row: { id: string; language: string; transcript: unknown; entities: unknown; summary: string }) {
  const s = await db();
  await s.from("call_logs").upsert(row as never);
}
