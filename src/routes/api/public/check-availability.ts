import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/check-availability")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { availabilityInput, checkAvailability } = await import("@/lib/clinic.server");
        const parsed = availabilityInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
        try {
          return Response.json(await checkAvailability(parsed.data as never));
        } catch (e) {
          console.error(e);
          return Response.json({ error: "server_error" }, { status: 500 });
        }
      },
    },
  },
});
