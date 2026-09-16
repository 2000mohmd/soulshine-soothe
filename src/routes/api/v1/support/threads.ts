import { createFileRoute } from "@tanstack/react-router";
import { createSupportThread, listMySupportThreads } from "@/lib/support.functions";
import { handle, json } from "../-shared";

// GET = the caller's support threads (account/billing/feedback — never the
// crisis "talk to a person" path, see src/lib/human-handoff.functions.ts for
// that). POST = open a new one.
export const Route = createFileRoute("/api/v1/support/threads")({
  server: {
    handlers: {
      GET: async () => handle(async () => json(await listMySupportThreads())),
      POST: async ({ request }) =>
        handle(async () => json(await createSupportThread({ data: await request.json() }))),
    },
  },
});
