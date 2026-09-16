import { createFileRoute } from "@tanstack/react-router";
import { getMySupportThread } from "@/lib/support.functions";
import { handle, json } from "../../-shared";

// GET /api/v1/support/threads/:id — a thread + its messages.
export const Route = createFileRoute("/api/v1/support/threads/$id")({
  server: {
    handlers: {
      GET: async ({ params }) =>
        handle(async () => json(await getMySupportThread({ data: { thread_id: params.id } }))),
    },
  },
});
