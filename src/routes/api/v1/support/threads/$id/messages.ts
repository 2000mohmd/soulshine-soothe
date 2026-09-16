import { createFileRoute } from "@tanstack/react-router";
import { replyToMySupportThread } from "@/lib/support.functions";
import { handle, json } from "../../../-shared";

// POST /api/v1/support/threads/:id/messages — add a message to an existing
// support thread (the member's side of the conversation).
export const Route = createFileRoute("/api/v1/support/threads/$id/messages")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        handle(async () => {
          const body = (await request.json()) as Record<string, unknown>;
          return json(
            await replyToMySupportThread({ data: { ...body, thread_id: params.id } }),
          );
        }),
    },
  },
});
