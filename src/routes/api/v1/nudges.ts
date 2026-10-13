import { createFileRoute } from "@tanstack/react-router";
import { getNudges, updateNudge } from "@/lib/nudges.functions";
import { handle, json } from "./-shared";

// GET = re-evaluate, then the live (undismissed) nudges, as the web dashboard
// does on load. PATCH = dismiss / mark acted on.
export const Route = createFileRoute("/api/v1/nudges")({
  server: {
    handlers: {
      GET: async () => handle(async () => json(await getNudges({ data: { evaluate: true } }))),
      PATCH: async ({ request }) =>
        handle(async () => json(await updateNudge({ data: await request.json() }))),
    },
  },
});
