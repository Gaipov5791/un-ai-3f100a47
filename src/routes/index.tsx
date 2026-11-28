import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, Send, Sparkles, LayoutDashboard, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { AcousticSphere } from "@/components/cockpit/AcousticSphere";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { t, type Lang } from "@/lib/i18n";
import { tts } from "@/lib/tts";
import type { VoiceGender } from "@/lib/tts.shared";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "un-ai — Neo-Audio Cockpit клиники «Ак-Жол»" },
      { name: "description", content: "Говорите с ассистентом на казахском или русском: подбор врача, проверка слотов и запись на приём." },
      { property: "og:title", content: "un-ai — Neo-Audio Cockpit" },
      { property: "og:description", content: "Голосовая запись к врачу клиники «Ак-Жол» на казахском и русском." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Cockpit,
});

type Msg = { role: "user" | "assistant"; content: string };
type Mode = "idle" | "listening" | "thinking" | "speaking";

function Cockpit() {
  const [lang, setLang] = useState<Lang>("kk");
  const L = t[lang];
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [level, setLevel] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [gender, setGender] = useState<VoiceGender>("female");
  const [sessionId, setSessionId] = useState("");
  const [textMode, setTextMode] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState(false);
  const callId = useRef<string>("");
  const recRef = useRef<any>(null);
  const audioRef = useRef<{ stop: () => void } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const activateTextMode = useCallback(() => {
    tts.stop();
    setLevel(0);
    setMode("idle");
    setVoiceOn(false);
    setTextMode(true);
    setVoiceNotice(true);
  }, []);

  useEffect(() => {
    callId.current = crypto.randomUUID();
    let id = localStorage.getItem("un-ai-tts-session");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("un-ai-tts-session", id);
    }
    setSessionId(id);
    if (localStorage.getItem("un-ai-assistant-voice") === "male") setGender("male");
    return () => tts.stop();
  }, []);

  useEffect(() => {
    tts.stop();
    setMode("idle");
    setMessages([{ role: "assistant", content: t[lang].greeting }]);
  }, [lang]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    fetch(`/api/public/tts?session_id=${encodeURIComponent(sessionId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("quota");
        return response.json() as Promise<{ available?: boolean }>;
      })
      .then((quota) => { if (active && !quota.available) activateTextMode(); })
      .catch(() => { if (active) activateTextMode(); });
    return () => { active = false; };
  }, [sessionId, activateTextMode]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mode, voiceNotice]);

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

  async function speakReply(text: string) {
    if (!voiceOn || textMode || !sessionId) { setMode("idle"); return; }
    setMode("speaking");
    try {
      await tts.speak(text, lang, { gender, sessionId, onLevel: setLevel });
    } catch {
      activateTextMode();
    } finally {
      setLevel(0);
      setMode((current) => current === "speaking" ? "idle" : current);
    }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || mode === "thinking") return;
    tts.stop();
    if (voiceOn && !textMode) void tts.unlock().catch(activateTextMode);
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
      if (data.actions?.some((a: any) => a.type === "booking" && a.data?.ok)) toast.success(lang === "kk" ? "Жазылу расталды" : "Запись подтверждена");
      void speakReply(data.reply);
    } catch (e) {
      toast.error((e as Error).message);
      setMode("idle");
    }
  }

  async function toggleMic() {
    if (textMode) return;
    if (mode === "listening") { recRef.current?.stop(); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error(L.noMic); return; }
    tts.stop();
    if (voiceOn) void tts.unlock().catch(activateTextMode);
    const rec = new SR();
    rec.lang = lang === "kk" ? "kk-KZ" : "ru-RU";
    rec.interimResults = true;
    let finalText = "";
    let stream: MediaStream | null = null;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
    if (isMobile) {
      let raf = 0; const t0 = performance.now();
      const tick = () => { setLevel(0.35 + 0.25 * Math.sin((performance.now() - t0) / 180)); raf = requestAnimationFrame(tick); };
      tick();
      audioRef.current = { stop: () => { cancelAnimationFrame(raf); setLevel(0); } };
    } else try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ac = new AudioContext();
      const an = ac.createAnalyser();
      an.fftSize = 256;
      ac.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      let raf = 0;
      const tick = () => { an.getByteFrequencyData(buf); setLevel(Math.min(1, buf.reduce((a, b) => a + b, 0) / buf.length / 80)); raf = requestAnimationFrame(tick); };
      tick();
      audioRef.current = { stop: () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((track) => track.stop()); ac.close(); setLevel(0); } };
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
    rec.onerror = (e: any) => {
      audioRef.current?.stop(); setMode("idle");
      const err = e?.error;
      if (err === "not-allowed" || err === "service-not-allowed") toast.error(lang === "kk" ? "Микрофонға рұқсат беріңіз (браузер баптаулары)." : "Разрешите доступ к микрофону в настройках браузера.");
      else if (err === "no-speech") toast.error(lang === "kk" ? "Дауыс естілмеді, қайталап көріңіз." : "Речь не распознана, попробуйте ещё раз.");
      else if (err && err !== "aborted") toast.error(lang === "kk" ? "Микрофон қатесі. Chrome немесе Safari браузерін ашыңыз." : "Ошибка микрофона. Откройте сайт в Chrome или Safari.");
    };
    recRef.current = rec;
    setMode("listening");
    try { rec.start(); } catch { audioRef.current?.stop(); setMode("idle"); toast.error(L.noMic); }
  }

  function chooseGender(value: VoiceGender) {
    tts.stop();
    setGender(value);
    localStorage.setItem("un-ai-assistant-voice", value);
  }

  const modeLabel = { idle: L.idle, listening: L.listening, thinking: L.thinking, speaking: L.speaking }[mode];

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-3 py-4 sm:px-4 sm:py-5 md:h-dvh md:min-h-0 md:overflow-hidden md:px-6 md:py-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <div className="font-display text-xl font-bold tracking-tight text-primary sm:text-2xl">un-ai</div>
          <div className="truncate text-[10px] uppercase tracking-[0.15em] text-muted-foreground sm:text-xs sm:tracking-[0.2em]">Клиника «Ак-Жол» · {L.tagline}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="flex rounded-full border border-border bg-panel p-1">
            {(["kk", "ru"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)}
                className={cn("rounded-full px-3 py-1 text-xs font-semibold sm:px-4 sm:py-1.5 sm:text-sm transition", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {l === "ru" ? "RU" : "KZ"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" disabled={textMode} onClick={() => { if (voiceOn) tts.stop(); else void tts.unlock().catch(activateTextMode); setVoiceOn((value) => !value); }} aria-label="Голос ассистента">
            {voiceOn ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button asChild variant="secondary" size="sm" className="px-2.5 sm:px-3"><Link to="/reception" aria-label={L.reception}><LayoutDashboard /> <span className="hidden sm:inline">{L.reception}</span></Link></Button>
        </div>
      </header>

      <main className="mt-4 grid flex-1 gap-4 sm:gap-6 md:min-h-0 md:grid-cols-[1fr_1fr] md:gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="relative flex min-h-0 flex-col items-center justify-center rounded-3xl border border-border bg-panel p-4 shadow-glow sm:p-6 md:p-4">
          <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between gap-2 text-[10px] text-muted-foreground sm:text-xs">
            <span>{L.voice}</span>
            <div className="flex rounded-full border border-border bg-background/60 p-0.5">
              {(["female", "male"] as const).map((value) => (
                <button key={value} disabled={textMode} onClick={() => chooseGender(value)} className={cn("rounded-full px-2.5 py-1 transition disabled:opacity-50", gender === value ? "bg-secondary text-foreground" : "hover:text-foreground")}>
                  {value === "female" ? L.female : L.male}
                </button>
              ))}
            </div>
          </div>
          <div className="aspect-square w-full max-w-[460px] md:min-h-0 md:w-auto md:max-w-full md:flex-1"><AcousticSphere level={level} mode={mode} /></div>
          <p className="mt-2 shrink-0 font-display text-sm tracking-wide text-muted-foreground">{modeLabel}</p>
          <button onClick={toggleMic} disabled={textMode || mode === "thinking"} aria-label="Микрофон"
            className={cn("mt-3 flex h-16 w-16 shrink-0 items-center sm:h-20 sm:w-20 justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40", mode === "listening" ? "bg-accent text-accent-foreground animate-pulse" : "bg-primary text-primary-foreground hover:scale-105")}>
            {mode === "listening" ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
          </button>
          <div className="mt-4 grid w-full max-w-sm shrink-0 grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl border border-border p-3"><div className="font-display text-2xl text-primary">{stats.data?.free ?? "–"}</div><div className="text-xs text-muted-foreground">{L.today}: {L.free}</div></div>
            <div className="rounded-2xl border border-border p-3"><div className="font-display text-2xl text-accent">{stats.data?.booked ?? "–"}</div><div className="text-xs text-muted-foreground">{L.today}: {L.booked}</div></div>
          </div>
        </section>

        <section className="flex min-h-[480px] flex-col rounded-3xl sm:min-h-[560px] md:min-h-0 border border-border bg-panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="font-display text-sm">{textMode ? L.textMode : "Chat"}</span>
            <Button size="sm" variant="ghost" onClick={() => send(L.demoLine)} disabled={mode === "thinking"}><Sparkles /> {L.demo}</Button>
          </div>
          {voiceNotice && (
            <div className="border-b border-border bg-secondary/60 px-5 py-3 text-xs leading-relaxed text-secondary-foreground">
              <p>{L.voiceLimit}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setVoiceNotice(false)}>{L.continueText}</Button>
            </div>
          )}
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
