import { createFileRoute } from "@tanstack/react-router";
import { getMyMemories } from "@/lib/memory.functions";
import { handle, json } from "./-shared";

// GET /api/v1/memories — "What Kalm remembers about you" (past-conversation summaries).
export const Route = createFileRoute("/api/v1/memories")({
  server: { handlers: { GET: async () => handle(async () => json(await getMyMemories())) } },
});
