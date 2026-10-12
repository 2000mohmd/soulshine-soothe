import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SafetyFooter } from "@/components/SafetyFooter";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "Disclaimers, privacy & terms — Kalm" },
      {
        name: "description",
        content:
          "How Kalm handles sensitive wellness data, what the AI companion is and isn't, and your data rights.",
      },
      { property: "og:title", content: "Disclaimers, privacy & terms — Kalm" },
      {
        property: "og:description",
        content: "What Kalm is, what it isn't, and how your wellness data is handled.",
      },
    ],
  }),
  component: LegalPage,
});

const SECTION_KEYS = [
  "notMedical",
  "howAiWorks",
  "yourData",
  "ageRequirement",
  "workplace",
] as const;

function LegalPage() {
  const { t, language } = useTranslation();

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
        <h1 className="text-4xl">{t("legal.title")}</h1>
        {language !== "en" ? (
          <p className="mt-3 text-xs text-muted-foreground">{t("language.reviewNotice")}</p>
        ) : null}
        <div className="mt-10 space-y-8">
          {SECTION_KEYS.map((key) => (
            <section key={key}>
              <h2 className="text-xl">{t(`legal.sections.${key}.heading`)}</h2>
              <p className="mt-2 text-muted-foreground">{t(`legal.sections.${key}.body`)}</p>
            </section>
          ))}
        </div>
        <p className="mt-12 text-sm text-muted-foreground">
          {t("legal.questionsData")}{" "}
          <Link to="/chat" search={{ support: true }} className="font-semibold text-primary underline underline-offset-4">
            {t("landing.crisisResources")}
          </Link>
        </p>
      </main>
      <SafetyFooter />
    </div>
  );
}
