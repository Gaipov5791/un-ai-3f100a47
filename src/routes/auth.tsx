import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Вход для сотрудников — un-ai, клиника «Ак-Жол»" },
      { name: "description", content: "Вход в пульт Smart Reception для сотрудников клиники «Ак-Жол»." },
      { property: "og:title", content: "Вход для сотрудников — un-ai" },
      { property: "og:description", content: "Вход в пульт Smart Reception клиники «Ак-Жол»." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const target = redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/reception";
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: target });
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + target } });
        if (error) throw error;
        if (data.session) navigate({ to: target });
        else toast.success("Проверьте почту и подтвердите адрес, затем войдите.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl border border-border bg-panel p-6 shadow-glow">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> В кокпит</Link>
        <div>
          <h1 className="font-display text-xl font-bold">{mode === "in" ? "Вход для сотрудников" : "Регистрация сотрудника"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">Пульт Smart Reception · клиника «Ак-Жол»</p>
        </div>
        <Input type="email" required placeholder="Эл. почта" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input type="password" required minLength={8} placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" className="w-full" disabled={busy}>{mode === "in" ? "Войти" : "Зарегистрироваться"}</Button>
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">
          {mode === "in" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
        </button>
      </form>
    </div>
  );
}
