import { createFileRoute } from "@tanstack/react-router";
import { listCareResources } from "@/lib/nudges.functions";
import { handle, json } from "./-shared";

// GET /api/v1/care-resources — professional-support options for the member's region.
export const Route = createFileRoute("/api/v1/care-resources")({
  server: { handlers: { GET: async () => handle(async () => json(await listCareResources())) } },
});
