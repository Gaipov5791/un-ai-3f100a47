import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, Send, Sparkles, LayoutDashboard, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { AcousticSphere } from "@/components/cockpit/AcousticSphere";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "un-ai — Neo-Audio Cockpit клиники «Ак-Жол»" },
      { name: "description", content: "Говорите с ассистентом на русском или кыргызском: подбор врача, проверка слотов и запись на приём." },
      { property: "og:title", content: "un-ai — Neo-Audio Cockpit" },
      { property: "og:description", content: "Голосовая запись к врачу клиники «Ак-Жол» на русском и кыргызском." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Cockpit,
});

type Msg = { role: "user" | "assistant"; content: string };
type Mode = "idle" | "listening" | "thinking" | "speaking";

function Cockpit() {
  const [lang, setLang] = useState<Lang>("ru");
  const L = t[lang];
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [level, setLevel] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const callId = useRef<string>("");
  const recRef = useRef<any>(null);
  const audioRef = useRef<{ stop: () => void } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    callId.current = crypto.randomUUID();
    setMessages([{ role: "assistant", content: t[lang].greeting }]);
  }, [lang]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mode]);

  const stats = useQuery({
    queryKey: ["today-stats"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from("schedule_slots").select("status").eq("slot_date", today);
      const free = data?.filter((s) => s.status === "available").length ?? 0;
      return { free, booked: (data?.length ?? 0) - free };
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel(`cockpit-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_slots" }, () =>
        qc.invalidateQueries({ queryKey: ["today-stats"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  function speak(text: string) {
    if (!voiceOn || typeof speechSynthesis === "undefined") { setMode("idle"); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "ky" ? "ky-KG" : "ru-RU";
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang)) ?? speechSynthesis.getVoices().find((v) => v.lang.startsWith("ru"));
    if (voice) u.voice = voice;
    u.onend = () => setMode("idle");
    u.onerror = () => setMode("idle");
    setMode("speaking");
    speechSynthesis.speak(u);
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || mode === "thinking") return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setMode("thinking");
    try {
      const res = await fetch("/api/public/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ call_id: callId.current, lang, messages: next.slice(-30) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      if (data.actions?.some((a: any) => a.type === "booking" && a.data?.ok)) toast.success(lang === "ky" ? "Жазылуу ырасталды" : "Запись подтверждена");
      speak(data.reply);
    } catch (e) {
      toast.error((e as Error).message);
      setMode("idle");
    }
  }

  async function toggleMic() {
    if (mode === "listening") { recRef.current?.stop(); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error(L.noMic); return; }
    speechSynthesis?.cancel();
    const rec = new SR();
    rec.lang = lang === "ky" ? "ky-KG" : "ru-RU";
    rec.interimResults = true;
    let finalText = "";
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ac = new AudioContext();
      const an = ac.createAnalyser();
      an.fftSize = 256;
      ac.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      let raf = 0;
      const tick = () => { an.getByteFrequencyData(buf); setLevel(Math.min(1, buf.reduce((a, b) => a + b, 0) / buf.length / 80)); raf = requestAnimationFrame(tick); };
      tick();
      audioRef.current = { stop: () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); ac.close(); setLevel(0); } };
    } catch { /* visualizer optional */ }
    rec.onresult = (e: any) => {
      let s = "";
      for (const r of e.results) s += r[0].transcript;
      finalText = s;
      setInput(s);
    };
    rec.onend = () => {
      audioRef.current?.stop();
      setMode("idle");
      if (finalText) send(finalText);
    };
    rec.onerror = () => { audioRef.current?.stop(); setMode("idle"); };
    recRef.current = rec;
    setMode("listening");
    rec.start();
  }

  const modeLabel = { idle: L.idle, listening: L.listening, thinking: L.thinking, speaking: L.speaking }[mode];

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-3 py-4 sm:px-4 sm:py-5 md:px-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <div className="font-display text-xl font-bold tracking-tight text-primary sm:text-2xl">un-ai</div>
          <div className="truncate text-[10px] uppercase tracking-[0.15em] text-muted-foreground sm:text-xs sm:tracking-[0.2em]">Клиника «Ак-Жол» · {L.tagline}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="flex rounded-full border border-border bg-panel p-1">
            {(["ru", "ky"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)}
                className={cn("rounded-full px-3 py-1 text-xs font-semibold sm:px-4 sm:py-1.5 sm:text-sm transition", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {l === "ru" ? "RU" : "KY"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => { setVoiceOn((v) => !v); speechSynthesis?.cancel(); }} aria-label="Голос ассистента">
            {voiceOn ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button asChild variant="secondary" size="sm" className="px-2.5 sm:px-3"><Link to="/reception" aria-label={L.reception}><LayoutDashboard /> <span className="hidden sm:inline">{L.reception}</span></Link></Button>
        </div>
      </header>

      <main className="mt-4 grid flex-1 gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="relative flex flex-col items-center justify-center rounded-3xl border border-border bg-panel p-4 shadow-glow sm:p-6">
          <div className="aspect-square w-full max-w-[460px]"><AcousticSphere level={level} mode={mode} /></div>
          <p className="mt-2 font-display text-sm tracking-wide text-muted-foreground">{modeLabel}</p>
          <button onClick={toggleMic} aria-label="Микрофон"
            className={cn("mt-5 flex h-16 w-16 items-center sm:h-20 sm:w-20 justify-center rounded-full transition", mode === "listening" ? "bg-accent text-accent-foreground animate-pulse" : "bg-primary text-primary-foreground hover:scale-105")}>
            {mode === "listening" ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
          </button>
          <div className="mt-6 grid w-full max-w-sm grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl border border-border p-3"><div className="font-display text-2xl text-primary">{stats.data?.free ?? "–"}</div><div className="text-xs text-muted-foreground">{L.today}: {L.free}</div></div>
            <div className="rounded-2xl border border-border p-3"><div className="font-display text-2xl text-accent">{stats.data?.booked ?? "–"}</div><div className="text-xs text-muted-foreground">{L.today}: {L.booked}</div></div>
          </div>
        </section>

        <section className="flex min-h-[480px] sm:min-h-[560px] flex-col rounded-3xl border border-border bg-panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="font-display text-sm">Chat</span>
            <Button size="sm" variant="ghost" onClick={() => send(L.demoLine)} disabled={mode === "thinking"}><Sparkles /> {L.demo}</Button>
          </div>
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-5">
            {messages.map((m, i) => (
              <div key={i} className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed", m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>{m.content}</div>
            ))}
            {mode === "thinking" && <div className="w-fit rounded-2xl bg-secondary px-4 py-2.5 text-sm text-muted-foreground animate-pulse">…</div>}
          </div>
          <div className="flex flex-wrap gap-2 px-5 pb-2">
            {L.chips.map((c) => (
              <button key={c} onClick={() => send(c)} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground">{c}</button>
            ))}
          </div>
          <form className="flex gap-2 border-t border-border p-4" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={L.placeholder} />
            <Button type="submit" disabled={mode === "thinking"} aria-label={L.send}><Send /></Button>
          </form>
        </section>
      </main>
    </div>
  );
}
