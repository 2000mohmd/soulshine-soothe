import { createFileRoute } from "@tanstack/react-router";
import { getExerciseBySlug } from "@/lib/exercises.functions";
import { handle, json } from "../-shared";

// GET /api/v1/exercises/:slug — one exercise with its steps.
export const Route = createFileRoute("/api/v1/exercises/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) =>
        handle(async () => json(await getExerciseBySlug({ data: { slug: params.slug } }))),
    },
  },
});
