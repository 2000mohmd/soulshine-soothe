import { createFileRoute } from "@tanstack/react-router";
import { getMySafetyPlan, saveMySafetyPlan } from "@/lib/safety-plan.functions";
import { handle, json } from "./-shared";

// GET = the member's personal safety plan. PUT = replace it (send every section).
export const Route = createFileRoute("/api/v1/safety-plan")({
  server: {
    handlers: {
      GET: async () => handle(async () => json(await getMySafetyPlan())),
      PUT: async ({ request }) =>
        handle(async () => json(await saveMySafetyPlan({ data: await request.json() }))),
    },
  },
});
