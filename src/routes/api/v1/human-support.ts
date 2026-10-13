import { createFileRoute } from "@tanstack/react-router";
import { getMyHumanSupport, requestHumanSupport } from "@/lib/human-handoff.functions";
import { handle, json } from "./-shared";

// In-chat "Talk to a human" (the crisis-adjacent path, NOT account/billing
// support — that is /api/v1/support/threads).
// GET = the member's current or most recent request + its messages.
// POST = open a request (reuses the open one if there is one).
export const Route = createFileRoute("/api/v1/human-support")({
  server: {
    handlers: {
      GET: async () => handle(async () => json(await getMyHumanSupport())),
      POST: async ({ request }) =>
        handle(async () =>
          json(await requestHumanSupport({ data: await request.json().catch(() => ({})) })),
        ),
    },
  },
});
