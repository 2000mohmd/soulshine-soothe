import { createFileRoute } from "@tanstack/react-router";

// Temporary diagnostic: confirms the AI providers accept the configured keys.
export const Route = createFileRoute("/api/public/envcheck")({
  server: {
    handlers: {
      GET: async () => {
        const or = process.env["OPENROUTER_API_KEY"] ?? "";
        const oa = process.env["OPENAI_API_KEY"] ?? "";
        const [orRes, oaRes] = await Promise.all([
          fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${or}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "anthropic/claude-haiku-4.5",
              max_tokens: 8,
              messages: [{ role: "user", content: "say ok" }],
            }),
          }),
          fetch("https://api.openai.com/v1/models/gpt-4o-mini-transcribe", {
            headers: { Authorization: `Bearer ${oa}` },
          }),
        ]);
        return Response.json({
          openrouter: { status: orRes.status, body: (await orRes.text()).slice(0, 200) },
          openai: { status: oaRes.status, body: (await oaRes.text()).slice(0, 200) },
        });
      },
    },
  },
});
