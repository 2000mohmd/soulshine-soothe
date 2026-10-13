import { createFileRoute } from "@tanstack/react-router";
import { forgetMemory } from "@/lib/memory.functions";
import { handle, json } from "../-shared";

// DELETE /api/v1/memories/:id — forget one memory.
export const Route = createFileRoute("/api/v1/memories/$id")({
  server: {
    handlers: {
      DELETE: async ({ params }) =>
        handle(async () => json(await forgetMemory({ data: { id: params.id } }))),
    },
  },
});
