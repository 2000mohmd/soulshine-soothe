import { createFileRoute } from "@tanstack/react-router";
import { listWeeklyDigests } from "@/lib/digests.functions";
import { handle, json } from "./-shared";

// GET /api/v1/digests — weekly summaries, newest first (up to 26).
export const Route = createFileRoute("/api/v1/digests")({
  server: { handlers: { GET: async () => handle(async () => json(await listWeeklyDigests())) } },
});
