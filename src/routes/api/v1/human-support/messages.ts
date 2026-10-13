import { createFileRoute } from "@tanstack/react-router";
import { replyToMyHumanSupport } from "@/lib/human-handoff.functions";
import { handle, json } from "../-shared";

// POST /api/v1/human-support/messages — the member replies on their request.
export const Route = createFileRoute("/api/v1/human-support/messages")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        handle(async () => json(await replyToMyHumanSupport({ data: await request.json() }))),
    },
  },
});
