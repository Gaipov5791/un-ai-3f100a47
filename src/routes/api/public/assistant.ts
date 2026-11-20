import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  call_id: z.string().uuid(),
  lang: z.enum(["ru", "ky"]),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .min(1)
    .max(40),
});

function instructions(lang: "ru" | "ky") {
  const today = new Date().toISOString().slice(0, 10);
  return `Ты — "un-ai", голосовой ассистент регистратуры клиники «Ак-Жол» (Бишкек). Сегодня ${today}.
Отвечай ${lang === "ky" ? "на кыргызском языке" : "на русском языке"}, коротко (1–3 предложения), тепло и по делу — ответ будет озвучен голосом.
Задачи: подобрать врача по симптомам, проверить свободное время (check_availability), записать пациента (create_booking), отменить запись (find_appointments + cancel_booking).
Перед бронированием обязательно узнай ФИО, телефон и жалобы, затем повтори дату, время и врача и получи согласие. Никогда не выдумывай слоты — используй только результаты инструментов. При экстренных симптомах (боль в груди, потеря сознания) советуй звонить 103.`;
}

export const Route = createFileRoute("/api/public/assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });
        const { call_id, lang, messages } = parsed.data;
        const apiKey = process.env['LOVABLE_API_KEY'];
        if (!apiKey) return Response.json({ error: "AI не настроен" }, { status: 500 });

        const { streamText, tool, stepCountIs } = await import("ai");
        const { createOpenAI } = await import("@ai-sdk/openai");
        const { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId } = await import("@/lib/ai/run-id");
        const clinic = await import("@/lib/clinic.server");

        const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });

        const entities: Record<string, unknown> = {};
        const actions: { type: string; data: unknown }[] = [];

        const tools = {
          check_availability: tool({
            description: "Свободные слоты по специальности/врачу и дате (YYYY-MM-DD).",
            inputSchema: z.object({
              specialty: z.string().nullable(),
              doctor_id: z.string().nullable(),
              date: z.string().nullable(),
            }),
            execute: async (i) => {
              Object.assign(entities, { specialty: i.specialty ?? entities['specialty'], date: i.date ?? entities['date'] });
              const r = await clinic.checkAvailability({
                ...(i.specialty ? { specialty: i.specialty } : {}),
                ...(i.doctor_id ? { doctor_id: i.doctor_id } : {}),
                ...(i.date ? { date: i.date } : {}),
              });
              actions.push({ type: "availability", data: { count: r.slots.length } });
              return r;
            },
          }),
          create_booking: tool({
            description: "Забронировать слот после подтверждения пациентом.",
            inputSchema: z.object({
              slot_id: z.string(),
              patient_name: z.string(),
              phone: z.string(),
              symptoms: z.string(),
            }),
            execute: async (i) => {
              Object.assign(entities, { patient_name: i.patient_name, phone: i.phone, symptoms: i.symptoms });
              const p = clinic.bookingInput.safeParse({ ...i, language: lang });
              if (!p.success) return { ok: false, error: "invalid_input" };
              const r = await clinic.createBooking(p.data);
              actions.push({ type: "booking", data: r });
              return r;
            },
          }),
          find_appointments: tool({
            description: "Найти активные записи пациента по номеру телефона.",
            inputSchema: z.object({ phone: z.string() }),
            execute: async (i) => clinic.findAppointmentsByPhone(i.phone),
          }),
          cancel_booking: tool({
            description: "Отменить запись по appointment_id.",
            inputSchema: z.object({ appointment_id: z.string() }),
            execute: async (i) => {
              const p = clinic.cancelInput.safeParse(i);
              if (!p.success) return { ok: false };
              const r = await clinic.cancelBooking(p.data);
              actions.push({ type: "cancel", data: r });
              return r;
            },
          }),
        };

        try {
          const result = streamText({
            model: provider.responses("openai/gpt-6-astra"),
            instructions: instructions(lang),
            messages,
            tools,
            stopWhen: stepCountIs(6),
            abortSignal: request.signal,
            providerOptions: {
              openai: {
                forceReasoning: true,
                reasoningEffort: "low",
                reasoningSummary: "auto",
                store: false,
                include: ["reasoning.encrypted_content"],
              },
            },
          });
          const reply = (await result.text).trim();
          await clinic
            .logCall({
              id: call_id,
              language: lang,
              transcript: [...messages, { role: "assistant", content: reply }],
              entities,
              summary: reply.slice(0, 400),
            })
            .catch((e) => console.error(e));
          return Response.json({ reply, actions });
        } catch (e: unknown) {
          console.error(e);
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 429) return Response.json({ error: "Слишком много запросов, попробуйте позже." }, { status: 429 });
          if (status === 402) return Response.json({ error: "Закончились AI-кредиты." }, { status: 402 });
          return Response.json({ error: "Ассистент временно недоступен." }, { status: 500 });
        }
      },
    },
  },
});
