<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## un-ai architecture
- Booking logic lives in `src/lib/clinic.server.ts`; all writes go through the `book_slot` / `cancel_appointment` DB functions (atomic, overbooking-safe) — never update slots directly from app code.
- Voice-assistant function-calling endpoints are TanStack server routes under `src/routes/api/public/` (check-availability, create-booking, cancel-booking, assistant), not Supabase Edge Functions — the stack forbids new Edge Functions.
- Appointments/call_logs have no anon RLS access (patient PII); the reception console reads them via server functions, and realtime listens to `schedule_slots` only.
- Reception console lives under `src/routes/_authenticated/`; its server functions require sign-in AND the `staff` role (`has_role`). The first registered account is auto-granted staff by a DB trigger; grant others by inserting into `user_roles`.
- Public assistant/API lookups and cancellations must verify the caller-supplied phone (and name for lookups) against the appointment before revealing or changing it.
