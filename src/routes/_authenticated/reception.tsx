import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarDays, LogOut, Radio, Volume2, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listAppointments, cancelFromReception, bookFromReception, getStaffStatus } from "@/lib/reception.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { VoiceUsagePanel } from "@/components/reception/VoiceUsagePanel";

export const Route = createFileRoute("/_authenticated/reception")({
  head: () => ({
    meta: [
      { title: "Пульт Smart Reception — un-ai, клиника «Ак-Жол»" },
      { name: "description", content: "Врачи, календарь слотов и журнал подтверждённых записей в реальном времени." },
      { property: "og:title", content: "Пульт Smart Reception — un-ai" },
      { property: "og:description", content: "Администрирование записей клиники «Ак-Жол» в реальном времени." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Reception,
});

const days = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
});
const fmtDay = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });

function Reception() {
  const qc = useQueryClient();
  const fetchAppts = useServerFn(listAppointments);
  const cancelFn = useServerFn(cancelFromReception);
  const bookFn = useServerFn(bookFromReception);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [day, setDay] = useState(days[0]!);
  const [booking, setBooking] = useState<{ id: string; time: string } | null>(null);
  const [form, setForm] = useState({ patient_name: "", phone: "", symptoms: "" });
  const [live, setLive] = useState(false);
  const [view, setView] = useState<"schedule" | "voice">("schedule");

  const doctors = useQuery({
    queryKey: ["doctors"],
    queryFn: async () => (await supabase.from("doctors").select("*").order("full_name")).data ?? [],
  });
  const activeDoc = doctorId ?? doctors.data?.find((d) => d.status === "active")?.id ?? null;

  const slots = useQuery({
    queryKey: ["slots", activeDoc, day],
    enabled: !!activeDoc,
    queryFn: async () => (await supabase.from("schedule_slots").select("*").eq("doctor_id", activeDoc!).eq("slot_date", day).order("slot_time")).data ?? [],
  });
  const staffFn = useServerFn(getStaffStatus);
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => staffFn() });
  const appts = useQuery({ queryKey: ["appointments"], queryFn: () => fetchAppts(), enabled: staff.data?.isStaff === true });
  const navigate = useNavigate();
  async function signOut() {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  useEffect(() => {
    const ch = supabase
      .channel(`reception-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_slots" }, () => {
        qc.invalidateQueries({ queryKey: ["slots"] });
        qc.invalidateQueries({ queryKey: ["appointments"] });
      })
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const confirmed = useMemo(() => (appts.data ?? []).filter((a) => a.status === "confirmed"), [appts.data]);

  async function submitBooking() {
    if (!booking) return;
    const r = await bookFn({ data: { slot_id: booking.id, ...form } }).catch((e) => ({ ok: false, error: e.message }));
    if (r.ok) { toast.success("Пациент записан"); setBooking(null); setForm({ patient_name: "", phone: "", symptoms: "" }); }
    else toast.error(r.error === "slot_taken" ? "Слот уже занят" : "Проверьте данные");
    qc.invalidateQueries();
  }

  if (staff.isLoading) return <div className="p-10 text-center text-muted-foreground">Проверка доступа…</div>;
  if (!staff.data?.isStaff)
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="font-display text-xl">Нет доступа</h1>
        <p className="mt-2 text-sm text-muted-foreground">Этот аккаунт не отмечен как сотрудник ресепшена. Обратитесь к администратору клиники.</p>
        <Button className="mt-6" variant="outline" onClick={signOut}><LogOut /> Выйти</Button>
      </div>
    );

  return (
    <div className="mx-auto flex max-w-7xl flex-col px-4 py-5 md:h-dvh md:overflow-hidden md:px-6 md:py-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button asChild variant="ghost" size="icon"><Link to="/" aria-label="Назад"><ArrowLeft /></Link></Button>
          <div>
            <h1 className="truncate font-display text-base font-bold sm:text-xl">Пульт Smart Reception</h1>
            <p className="text-xs text-muted-foreground">Клиника «Ак-Жол» · un-ai</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1"><Badge variant="outline" className={cn("gap-1.5", live && "border-primary text-primary")}><Radio className="h-3 w-3" /><span className="hidden sm:inline">{live ? "Онлайн" : "Подключение…"}</span></Badge>
        <Button variant="ghost" size="sm" onClick={signOut} aria-label="Выйти"><LogOut /> <span className="hidden sm:inline">Выйти</span></Button></div>
      </header>

      <div className="mt-4 flex gap-2" role="tablist" aria-label="Разделы пульта">
        <button role="tab" aria-selected={view === "schedule"} onClick={() => setView("schedule")} className={cn("flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition", view === "schedule" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}><CalendarDays className="h-4 w-4" /> Расписание</button>
        <button role="tab" aria-selected={view === "voice"} onClick={() => setView("voice")} className={cn("flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition", view === "voice" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}><Volume2 className="h-4 w-4" /> Расход голоса</button>
      </div>

      {view === "voice" ? (
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-4"><VoiceUsagePanel /></div>
      ) : (
      <div className="mt-4 grid gap-4 md:min-h-0 md:flex-1 md:grid-cols-[220px_1fr] lg:grid-cols-[240px_1fr_320px]">
        <aside className="overflow-y-auto rounded-3xl border border-border bg-panel p-4 md:min-h-0">
          <h2 className="mb-3 font-display text-sm text-muted-foreground">Врачи</h2>
          <div className="space-y-2">
            {doctors.data?.map((d) => (
              <button key={d.id} disabled={d.status !== "active"} onClick={() => setDoctorId(d.id)}
                className={cn("w-full rounded-2xl border p-3 text-left transition disabled:opacity-50", activeDoc === d.id ? "border-primary bg-secondary" : "border-border hover:border-primary/50")}>
                <div className="text-sm font-semibold">{d.full_name}</div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{d.specialty_ru} · каб. {d.room}</span>
                  <span className={d.status === "active" ? "text-primary" : "text-accent"}>{d.status === "active" ? "принимает" : "отпуск"}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="overflow-y-auto rounded-3xl border border-border bg-panel p-4 md:min-h-0">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {days.map((d) => (
              <button key={d} onClick={() => setDay(d)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs capitalize", day === d ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{fmtDay(d)}</button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {slots.data?.map((s) => (
              <button key={s.id} disabled={s.status === "booked"} onClick={() => setBooking({ id: s.id, time: s.slot_time.slice(0, 5) })}
                className={cn("rounded-2xl border p-4 text-center transition", s.status === "available" ? "border-primary/40 hover:bg-primary hover:text-primary-foreground" : "border-accent/40 bg-accent/10 text-accent")}>
                <div className="font-display text-lg">{s.slot_time.slice(0, 5)}</div>
                <div className="text-xs opacity-80">{s.status === "available" ? "свободно" : "занято"}</div>
              </button>
            ))}
            {slots.data?.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Нет слотов на этот день.</p>}
          </div>
        </section>

        <section className="flex flex-col rounded-3xl border border-border bg-panel p-4 md:col-span-2 md:min-h-0 lg:col-span-1">
          <h2 className="mb-3 font-display text-sm text-muted-foreground">Журнал записей ({confirmed.length})</h2>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto md:max-h-none md:min-h-0 md:flex-1">
            {confirmed.map((a) => (
              <div key={a.id} className="rounded-2xl border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{a.patient_name}</div>
                    <div className="text-xs text-muted-foreground">{a.phone} · {a.language.toUpperCase()}</div>
                  </div>
                  <Button size="icon" variant="ghost" aria-label="Отменить запись" onClick={async () => { await cancelFn({ data: { appointment_id: a.id } }); toast("Запись отменена"); qc.invalidateQueries(); }}><X /></Button>
                </div>
                <div className="mt-1 text-xs text-primary">{a.doctors?.full_name} · {a.schedule_slots && fmtDay(a.schedule_slots.slot_date)} {a.schedule_slots?.slot_time.slice(0, 5)}</div>
                {a.symptoms && <div className="mt-1 text-xs text-muted-foreground">{a.symptoms}</div>}
              </div>
            ))}
            {confirmed.length === 0 && <p className="text-sm text-muted-foreground">Пока нет записей.</p>}
          </div>
        </section>
      </div>
      )}

      <Dialog open={!!booking} onOpenChange={(o) => !o && setBooking(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Запись на {booking?.time}, {fmtDay(day)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="ФИО пациента" value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} />
            <Input placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Жалобы" value={form.symptoms} onChange={(e) => setForm({ ...form, symptoms: e.target.value })} />
            <Button className="w-full" onClick={submitBooking}>Записать</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
