import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { buildSsml, normalizeTtsText, selectVoice, TTS_RATE } from "@/lib/tts.shared";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers": "X-TTS-Cached",
};

const inputSchema = z.object({
  text: z.string().min(1).max(5000),
  lang: z.enum(["kk", "ru"]),
  gender: z.enum(["female", "male"]),
  session_id: z.string().uuid(),
});
const sessionSchema = z.string().uuid();
const prepareSchema = z.object({
  allowed: z.boolean(),
  scope: z.string().optional(),
  usage_id: z.string().uuid().optional(),
});

async function cachePath(voice: string, text: string) {
  const bytes = new TextEncoder().encode(`${voice}|${TTS_RATE}|${text}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}.mp3`;
}

function rejected(scope: string) {
  return Response.json(
    { error: scope === "rate_limited" ? "rate_limited" : "limit_reached", scope },
    { status: 429, headers: corsHeaders },
  );
}

function audioResponse(audio: ArrayBuffer, cached: boolean) {
  return new Response(audio, {
    headers: {
      ...corsHeaders,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-TTS-Cached": cached ? "true" : "false",
    },
  });
}

export const Route = createFileRoute("/api/public/tts")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const sessionId = sessionSchema.safeParse(new URL(request.url).searchParams.get("session_id"));
        if (!sessionId.success) {
          return Response.json({ error: "invalid_input" }, { status: 400, headers: corsHeaders });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("get_tts_quota", { _session_id: sessionId.data });
        if (error) {
          console.error("TTS quota check failed", error.message);
          return Response.json({ error: "tts_unavailable" }, { status: 503, headers: corsHeaders });
        }
        return Response.json(data, { headers: corsHeaders });
      },
      POST: async ({ request }) => {
        const parsed = inputSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: "invalid_input" }, { status: 400, headers: corsHeaders });
        }
        const text = normalizeTtsText(parsed.data.text);
        if (!text) return Response.json({ error: "invalid_input" }, { status: 400, headers: corsHeaders });

        const key = process.env["AZURE_SPEECH_KEY"];
        const region = process.env["AZURE_SPEECH_REGION"];
        if (!key || !region) {
          console.error("Azure Speech is not configured");
          return Response.json({ error: "tts_unavailable" }, { status: 503, headers: corsHeaders });
        }

        const { lang, gender, session_id: sessionId } = parsed.data;
        const voice = selectVoice(lang, gender);
        const path = await cachePath(voice, text);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const bucket = supabaseAdmin.storage.from("tts-cache");
        const cached = await bucket.download(path);

        const preparation = await supabaseAdmin.rpc("prepare_tts", {
          _session_id: sessionId,
          _chars: cached.data ? 0 : text.length,
          _voice: voice,
          _cached: Boolean(cached.data),
        });
        if (preparation.error) {
          console.error("TTS usage reservation failed", preparation.error.message);
          return Response.json({ error: "tts_unavailable" }, { status: 503, headers: corsHeaders });
        }
        const allowance = prepareSchema.safeParse(preparation.data);
        if (!allowance.success) {
          return Response.json({ error: "tts_unavailable" }, { status: 503, headers: corsHeaders });
        }
        if (!allowance.data.allowed) return rejected(allowance.data.scope ?? "global");

        if (cached.data) return audioResponse(await cached.data.arrayBuffer(), true);

        const usageId = allowance.data.usage_id;
        try {
          const azure = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
            method: "POST",
            headers: {
              "Ocp-Apim-Subscription-Key": key,
              "Content-Type": "application/ssml+xml; charset=utf-8",
              "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
            },
            body: buildSsml(text, lang, gender),
            signal: request.signal,
          });
          if (!azure.ok) {
            console.error("Azure Speech request failed", azure.status);
            if (usageId) await supabaseAdmin.from("tts_usage").delete().eq("id", usageId);
            return Response.json({ error: "tts_unavailable" }, { status: 502, headers: corsHeaders });
          }
          const audio = await azure.arrayBuffer();
          const uploaded = await bucket.upload(path, audio, { contentType: "audio/mpeg", upsert: true });
          if (uploaded.error) console.error("TTS cache upload failed", uploaded.error.message);
          return audioResponse(audio, false);
        } catch (error) {
          if (usageId) await supabaseAdmin.from("tts_usage").delete().eq("id", usageId);
          console.error("Azure Speech unavailable", error instanceof Error ? error.message : "unknown");
          return Response.json({ error: "tts_unavailable" }, { status: 502, headers: corsHeaders });
        }
      },
    },
  },
});
