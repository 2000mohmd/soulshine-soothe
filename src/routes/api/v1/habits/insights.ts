import { createFileRoute } from "@tanstack/react-router";
import { getHabitMoodInsights } from "@/lib/habits.functions";
import { handle, json } from "../-shared";

// GET /api/v1/habits/insights — habit completion vs mood, last 30 days.
export const Route = createFileRoute("/api/v1/habits/insights")({
  server: {
    handlers: { GET: async () => handle(async () => json(await getHabitMoodInsights())) },
  },
});
