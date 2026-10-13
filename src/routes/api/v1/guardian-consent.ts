import { createFileRoute } from "@tanstack/react-router";
import { getMyGuardianConsent, requestGuardianConsent } from "@/lib/guardian-consent.functions";
import { handle, json } from "./-shared";

// Under-18 accounts. GET = consent state. POST = (re)send the request email.
export const Route = createFileRoute("/api/v1/guardian-consent")({
  server: {
    handlers: {
      GET: async () => handle(async () => json(await getMyGuardianConsent())),
      POST: async ({ request }) =>
        handle(async () => json(await requestGuardianConsent({ data: await request.json() }))),
    },
  },
});
