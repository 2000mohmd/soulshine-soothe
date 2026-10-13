import { createFileRoute } from "@tanstack/react-router";
import { deleteThread } from "@/lib/chat.functions";
import { handle, json } from "../../-shared";

// DELETE /api/v1/chat/threads/:id — delete a conversation and its messages.
export const Route = createFileRoute("/api/v1/chat/threads/$id")({
  server: {
    handlers: {
      DELETE: async ({ params }) =>
        handle(async () => json(await deleteThread({ data: { thread_id: params.id } }))),
    },
  },
});
