import { createFileRoute } from "@tanstack/react-router";
import { deleteHabit, updateHabit } from "@/lib/habits.functions";
import { handle, json } from "../-shared";

// PATCH = edit a habit (name/category/frequency_target/is_active). DELETE = remove it.
export const Route = createFileRoute("/api/v1/habits/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) =>
        handle(async () =>
          json(await updateHabit({ data: { ...(await request.json()), id: params.id } })),
        ),
      DELETE: async ({ params }) =>
        handle(async () => json(await deleteHabit({ data: { id: params.id } }))),
    },
  },
});
