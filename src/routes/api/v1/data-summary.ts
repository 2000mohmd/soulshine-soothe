import { createFileRoute } from "@tanstack/react-router";
import { getMyDataSummary } from "@/lib/data-export.functions";
import { handle, json } from "./-shared";

// GET /api/v1/data-summary — counts of what Kalm stores about them (Settings → Your data).
export const Route = createFileRoute("/api/v1/data-summary")({
  server: { handlers: { GET: async () => handle(async () => json(await getMyDataSummary())) } },
});
