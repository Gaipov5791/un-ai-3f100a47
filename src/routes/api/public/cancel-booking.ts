import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cancel-booking")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { cancelInput, cancelBooking } = await import("@/lib/clinic.server");
        const parsed = cancelInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
        try {
          return Response.json(await cancelBooking(parsed.data as never));
        } catch (e) {
          console.error(e);
          return Response.json({ error: "server_error" }, { status: 500 });
        }
      },
    },
  },
});
