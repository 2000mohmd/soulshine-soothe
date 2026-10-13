import { createFileRoute } from "@tanstack/react-router";
import { answerDailyPrompt, getTodayPrompt } from "@/lib/daily-prompts.functions";
import { handle, json } from "./-shared";

// GET = today's reflection prompt (+ their answer if already given). POST = answer it.
export const Route = createFileRoute("/api/v1/daily-prompt")({
  server: {
    handlers: {
      GET: async () => handle(async () => json(await getTodayPrompt())),
      POST: async ({ request }) =>
        handle(async () => json(await answerDailyPrompt({ data: await request.json() }))),
    },
  },
});
