import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LANGUAGE_CODES, type Language } from "@/lib/i18n/languages";
import { getMyLanguage, setMyLanguage } from "@/lib/language.functions";
import { handle, json, readJson } from "./-shared";

const Body = z.object({
  language: z.string().refine((value) => LANGUAGE_CODES.includes(value as Language), {
    message: `One of: ${LANGUAGE_CODES.join(", ")}`,
  }),
});

// GET = { language } (null if never set). PUT = set it; drives AI replies,
// emails and crisis resources.
export const Route = createFileRoute("/api/v1/language")({
  server: {
    handlers: {
      GET: async () => handle(async () => json({ language: await getMyLanguage() })),
      PUT: async ({ request }) =>
        handle(async () => {
          const { language } = await readJson(request, Body);
          return json(await setMyLanguage({ data: language }));
        }),
    },
  },
});
