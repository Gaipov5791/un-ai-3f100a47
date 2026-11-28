import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "staff" });
  if (!data) throw new Error("FORBIDDEN");
}

export const listAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
  await assertStaff(context);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ appointment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { cancelBooking } = await import("@/lib/clinic.server");
    return cancelBooking(data);
  });

export const bookFromReception = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ slot_id: z.string().uuid(), patient_name: z.string().min(2).max(120), phone: z.string().min(5).max(30), symptoms: z.string().max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { createBooking } = await import("@/lib/clinic.server");
    return createBooking({ ...data, language: "ru" });
  });

export const getStaffStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "staff" });
    return { isStaff: Boolean(data) };
  });

const voiceUsageSchema = z.object({
  settings: z.object({
    enabled: z.boolean(),
    per_user_daily_chars: z.number().int().positive(),
    per_user_monthly_chars: z.number().int().positive(),
    global_monthly_chars: z.number().int().positive(),
  }),
  today_chars: z.number().int().nonnegative(),
  month_chars: z.number().int().nonnegative(),
  global_remaining: z.number().int().nonnegative(),
  per_user: z.array(z.object({
    session_id: z.string().uuid(),
    today_chars: z.number().int().nonnegative(),
    month_chars: z.number().int().nonnegative(),
    requests: z.number().int().nonnegative(),
    cached_requests: z.number().int().nonnegative(),
  })),
});

export const getVoiceUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { data, error } = await context.supabase.rpc("get_tts_admin_stats");
    if (error) throw new Error(error.message);
    return voiceUsageSchema.parse(data);
  });

const voiceSettingsInput = z.object({
  enabled: z.boolean(),
  daily: z.number().int().positive().max(10_000_000),
  monthly: z.number().int().positive().max(10_000_000),
  global: z.number().int().positive().max(10_000_000),
});

export const updateVoiceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => voiceSettingsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { error } = await context.supabase.rpc("update_tts_settings", {
      _enabled: data.enabled,
      _daily: data.daily,
      _monthly: data.monthly,
      _global: data.global,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
