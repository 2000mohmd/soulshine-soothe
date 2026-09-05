import { createFileRoute } from "@tanstack/react-router";

// Temporary diagnostic: reports only whether AI keys are visible at runtime.
export const Route = createFileRoute("/api/public/envcheck")({
  server: {
    handlers: {
      GET: async () => {
        const or = process.env["OPENROUTER_API_KEY"] ?? "";
        const oa = process.env["OPENAI_API_KEY"] ?? "";
        return Response.json({
          openrouter: { len: or.length, trimmedLen: or.trim().length, prefix: or.slice(0, 4) },
          openai: { len: oa.length, trimmedLen: oa.trim().length, prefix: oa.slice(0, 3) },
        });
      },
    },
  },
});
