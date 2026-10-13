import { createFileRoute } from "@tanstack/react-router";
import { addSuggestedHabits } from "@/lib/habits.functions";
import { handle, json } from "../-shared";

// POST /api/v1/habits/suggested — add the starter habit set (skips ones they have).
export const Route = createFileRoute("/api/v1/habits/suggested")({
  server: { handlers: { POST: async () => handle(async () => json(await addSuggestedHabits())) } },
});
