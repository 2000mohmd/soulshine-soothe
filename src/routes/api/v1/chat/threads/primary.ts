import { createFileRoute } from "@tanstack/react-router";
import { getPrimaryThread } from "@/lib/chat.functions";
import { handle, json } from "../../-shared";

// GET /api/v1/chat/threads/primary — the conversation the web chat opens on
// (created if they have none), with its messages. Use this for the main chat screen.
export const Route = createFileRoute("/api/v1/chat/threads/primary")({
  server: { handlers: { GET: async () => handle(async () => json(await getPrimaryThread())) } },
});
