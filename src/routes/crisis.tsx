import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LifeBuoy, ArrowLeft } from "lucide-react";
import { SafetyFooter } from "@/components/SafetyFooter";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { crisisCopy } from "@/lib/crisis";
import { useTranslation } from "@/lib/i18n";

// Public and server-rendered: crisis lines must never sit behind a sign-in.
// Signed-in members are sent on to the in-chat support view (human coach +
// crisis lines); the check is the local session only, so the page itself is
// never delayed by it.

export const Route = createFileRoute("/crisis")({
  head: () => ({
    meta: [
      { title: "Crisis resources — Kalm" },
      {
        name: "description",
        content:
          "Immediate crisis support lines and text services. Always free and never gated in Kalm.",
      },
      { property: "og:title", content: "Crisis resources — Kalm" },
      {
        property: "og:description",
        content: "Immediate crisis support lines and text services, always available in Kalm.",
      },
    ],
  }),
  component: CrisisPage,
});

function CrisisPage() {
  const { t, language } = useTranslation();
  const copy = crisisCopy(language);
  const navigate = useNavigate();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat", search: { support: true }, replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex justify-end px-6 pt-4">
        <LanguageSwitcher className="w-auto" />
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-14 pt-4">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("common.back")}
        </Link>

        <h1 className="text-4xl">{t("crisisPage.title")}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{t("crisisPage.intro")}</p>

        <div className="mt-10 space-y-4">
          {copy.resources.map((resource) => {
            const isUrl =
              /^https?:\/\//i.test(resource.contact) || resource.contact.includes(".com");
            const href = isUrl
              ? resource.contact.startsWith("http")
                ? resource.contact
                : `https://${resource.contact}`
              : undefined;
            const Wrapper = href ? "a" : "div";
            return (
              <Wrapper
                key={resource.name}
                {...(href ? { href, target: "_blank", rel: "noreferrer" } : {})}
                className="surface-soft flex items-start gap-4 p-6 hover:border-primary"
              >
                <LifeBuoy className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
                <span className="flex-1">
                  <span className="block text-lg font-semibold">{resource.name}</span>
                  <span className="mt-1 block text-muted-foreground">{resource.detail}</span>
                  <span className="mt-3 block text-sm font-semibold text-primary underline underline-offset-4">
                    {resource.contact}
                  </span>
                </span>
              </Wrapper>
            );
          })}
        </div>

        <div className="mt-10 rounded-2xl border border-crisis/40 bg-crisis-surface p-6 text-crisis">
          <p className="font-semibold">{t("crisisPage.immediateDangerTitle")}</p>
          <p className="mt-1">{t("crisisPage.immediateDangerBody")}</p>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">{copy.disclaimer}</p>
      </main>
      <SafetyFooter />
    </div>
  );
}
