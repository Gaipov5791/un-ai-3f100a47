import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CalendarDays, Gauge, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { getVoiceUsage, updateVoiceSettings } from "@/lib/reception.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const number = new Intl.NumberFormat("ru-RU");

export function VoiceUsagePanel() {
  const qc = useQueryClient();
  const getStats = useServerFn(getVoiceUsage);
  const saveSettings = useServerFn(updateVoiceSettings);
  const stats = useQuery({ queryKey: ["voice-usage"], queryFn: () => getStats() });
  const [form, setForm] = useState({ enabled: true, daily: 10000, monthly: 50000, global: 400000 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!stats.data) return;
    setForm({
      enabled: stats.data.settings.enabled,
      daily: stats.data.settings.per_user_daily_chars,
      monthly: stats.data.settings.per_user_monthly_chars,
      global: stats.data.settings.global_monthly_chars,
    });
  }, [stats.data]);

  async function save() {
    setSaving(true);
    try {
      await saveSettings({ data: form });
      toast.success("Настройки голоса сохранены");
      await qc.invalidateQueries({ queryKey: ["voice-usage"] });
    } catch {
      toast.error("Не удалось сохранить настройки");
    } finally {
      setSaving(false);
    }
  }

  if (stats.isLoading) return <div className="p-10 text-center text-muted-foreground">Загрузка расхода голоса…</div>;
  if (stats.error || !stats.data) return <div className="p-10 text-center text-muted-foreground">Не удалось загрузить статистику.</div>;

  const data = stats.data;
  const monthPercent = Math.min(100, (data.month_chars / data.settings.global_monthly_chars) * 100);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-3xl border border-border bg-panel p-5">
            <Activity className="text-primary" />
            <div className="mt-4 font-display text-2xl">{number.format(data.today_chars)}</div>
            <div className="mt-1 text-xs text-muted-foreground">символов сегодня</div>
          </div>
          <div className="rounded-3xl border border-border bg-panel p-5">
            <CalendarDays className="text-primary" />
            <div className="mt-4 font-display text-2xl">{number.format(data.month_chars)}</div>
            <div className="mt-1 text-xs text-muted-foreground">символов в этом месяце</div>
          </div>
          <div className="rounded-3xl border border-border bg-panel p-5">
            <Gauge className="text-accent" />
            <div className="mt-4 font-display text-2xl">{number.format(data.global_remaining)}</div>
            <div className="mt-1 text-xs text-muted-foreground">остаток общей квоты</div>
          </div>
        </div>

        <section className="rounded-3xl border border-border bg-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-sm">Общая месячная квота</h2>
            <span className="text-xs text-muted-foreground">{number.format(data.month_chars)} / {number.format(data.settings.global_monthly_chars)}</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${monthPercent}%` }} />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-border bg-panel">
          <h2 className="flex items-center gap-2 border-b border-border p-5 font-display text-sm"><Users className="h-4 w-4" /> Расход по сессиям</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border"><th className="p-4 font-medium">Сессия</th><th className="p-4 font-medium">Сегодня</th><th className="p-4 font-medium">За месяц</th><th className="p-4 font-medium">Запросы</th><th className="p-4 font-medium">Из кеша</th></tr>
              </thead>
              <tbody>
                {data.per_user.map((user) => (
                  <tr key={user.session_id} className="border-b border-border last:border-0">
                    <td className="p-4 font-mono text-xs">{user.session_id.slice(0, 8)}…</td>
                    <td className="p-4">{number.format(user.today_chars)}</td>
                    <td className="p-4">{number.format(user.month_chars)}</td>
                    <td className="p-4">{number.format(user.requests)}</td>
                    <td className="p-4 text-primary">{number.format(user.cached_requests)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.per_user.length === 0 && <p className="p-5 text-sm text-muted-foreground">Расхода пока нет.</p>}
          </div>
        </section>
      </div>

      <section className="h-fit rounded-3xl border border-border bg-panel p-5">
        <div className="flex items-center justify-between gap-4">
          <div><h2 className="font-display text-sm">Озвучка включена</h2><p className="mt-1 text-xs text-muted-foreground">Главный выключатель Azure Speech</p></div>
          <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} aria-label="Озвучка включена" />
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-xs text-muted-foreground">Лимит на сессию в день<Input className="mt-2" type="number" min={1} value={form.daily} onChange={(e) => setForm({ ...form, daily: Number(e.target.value) })} /></label>
          <label className="block text-xs text-muted-foreground">Лимит на сессию в месяц<Input className="mt-2" type="number" min={1} value={form.monthly} onChange={(e) => setForm({ ...form, monthly: Number(e.target.value) })} /></label>
          <label className="block text-xs text-muted-foreground">Общий лимит в месяц<Input className="mt-2" type="number" min={1} value={form.global} onChange={(e) => setForm({ ...form, global: Number(e.target.value) })} /></label>
        </div>
        <Button className="mt-6 w-full" onClick={save} disabled={saving || form.daily < 1 || form.monthly < 1 || form.global < 1}><Save /> {saving ? "Сохранение…" : "Сохранить настройки"}</Button>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">В Azure отправляются только символы сверх кеша. При достижении любого лимита новые обращения к Azure останавливаются автоматически.</p>
      </section>
    </div>
  );
}
