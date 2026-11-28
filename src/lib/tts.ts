import type { Lang } from "@/lib/i18n";
import type { VoiceGender } from "@/lib/tts.shared";

export type TtsFailureScope = "user_daily" | "user_monthly" | "global" | "disabled" | "rate_limited" | "unavailable";

export class TtsError extends Error {
  constructor(public scope: TtsFailureScope) {
    super(scope);
    this.name = "TtsError";
  }
}

type SpeakOptions = {
  gender: VoiceGender;
  sessionId: string;
  onLevel?: (level: number) => void;
};

export interface SpeechProvider {
  unlock(): Promise<void>;
  speak(text: string, lang: Lang, options: SpeakOptions): Promise<void>;
  stop(): void;
}

type ActivePlayback = {
  source: AudioBufferSourceNode;
  finish: () => void;
};

class AzureSpeechProvider implements SpeechProvider {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private playback: ActivePlayback | null = null;
  private generation = 0;
  private animation = 0;

  async unlock() {
    if (typeof window === "undefined") return;
    if (!this.context) {
      const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) throw new TtsError("unavailable");
      this.context = new AudioContextConstructor();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  async speak(text: string, lang: Lang, options: SpeakOptions) {
    this.stop();
    const generation = this.generation;
    await this.unlock();
    const response = await fetch("/api/public/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang, gender: options.gender, session_id: options.sessionId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { scope?: TtsFailureScope } | null;
      throw new TtsError(body?.scope ?? "unavailable");
    }
    const bytes = await response.arrayBuffer();
    if (generation !== this.generation || !this.context || !this.analyser) return;
    const audio = await this.context.decodeAudioData(bytes.slice(0));
    if (generation !== this.generation) return;

    await new Promise<void>((resolve) => {
      const source = this.context!.createBufferSource();
      source.buffer = audio;
      source.connect(this.analyser!);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(this.animation);
        options.onLevel?.(0);
        if (this.playback?.source === source) this.playback = null;
        source.disconnect();
        resolve();
      };
      source.onended = finish;
      this.playback = { source, finish };
      source.start();
      this.animateLevel(generation, options.onLevel);
    });
  }

  private animateLevel(generation: number, onLevel?: (level: number) => void) {
    if (!this.analyser || generation !== this.generation || !this.playback) return;
    const values = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(values);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    onLevel?.(Math.min(1, average / 70));
    this.animation = requestAnimationFrame(() => this.animateLevel(generation, onLevel));
  }

  stop() {
    this.generation += 1;
    cancelAnimationFrame(this.animation);
    this.playback?.finish();
    this.playback = null;
  }
}

export const tts: SpeechProvider = new AzureSpeechProvider();
