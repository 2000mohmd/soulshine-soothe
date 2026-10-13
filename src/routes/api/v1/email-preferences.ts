import { createFileRoute } from "@tanstack/react-router";
import { setEmailOptOut } from "@/lib/onboarding.functions";
import { handle, json } from "./-shared";

// PATCH /api/v1/email-preferences { opt_out } — proactive emails on/off.
// Current value: GET /api/v1/profile → profile.email_opt_out.
export const Route = createFileRoute("/api/v1/email-preferences")({
  server: {
    handlers: {
      PATCH: async ({ request }) =>
        handle(async () => json(await setEmailOptOut({ data: await request.json() }))),
    },
  },
});
