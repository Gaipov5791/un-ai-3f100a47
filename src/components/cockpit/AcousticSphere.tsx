import { useEffect, useRef } from "react";

type Props = { level: number; mode: "idle" | "listening" | "thinking" | "speaking" };

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function AcousticSphere({ level, mode }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(level);
  const modeRef = useRef(mode);
  levelRef.current = level;
  modeRef.current = mode;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const primary = cssVar("--primary");
    const accent = cssVar("--accent");
    let raf = 0;
    let smooth = 0;
    const N = 420;
    const pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = i * Math.PI * (3 - Math.sqrt(5));
      return [Math.cos(t) * r, y, Math.sin(t) * r] as const;
    });
    const draw = (time: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const m = modeRef.current;
      const target = m === "speaking" ? 0.35 + 0.35 * Math.abs(Math.sin(time / 120)) : m === "thinking" ? 0.2 : levelRef.current;
      smooth += (target - smooth) * 0.15;
      const base = Math.min(w, h) * 0.3;
      const rot = time / (m === "thinking" ? 1500 : 4000);
      const cx = w / 2, cy = h / 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 1.8);
      g.addColorStop(0, `color-mix(in oklab, ${primary} ${20 + smooth * 40}%, transparent)`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (const [x0, y0, z0] of pts) {
        const x = x0 * Math.cos(rot) - z0 * Math.sin(rot);
        const z = x0 * Math.sin(rot) + z0 * Math.cos(rot);
        const wave = 1 + smooth * 0.35 * Math.sin(y0 * 6 + time / 200) * Math.cos(x0 * 5 + time / 300);
        const r = base * wave;
        const px = cx + x * r, py = cy + y0 * r;
        const depth = (z + 1) / 2;
        ctx.globalAlpha = 0.15 + depth * 0.85;
        ctx.fillStyle = m === "speaking" && depth > 0.7 ? accent : primary;
        ctx.beginPath();
        ctx.arc(px, py, 0.6 + depth * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="h-full w-full" aria-label="Визуализация голоса" />;
}
