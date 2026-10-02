import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ErrorComponentProps } from "@tanstack/react-router";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import "../styles.css";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  LanguageProvider,
  languageDir,
  normalizeLanguage,
  useTranslation,
  type Language,
} from "@/lib/i18n";
import { getPreferredLanguage } from "@/lib/language.functions";

/**
 * Resolve the language for the very first render. On the server a tiny server
 * fn reads the preference cookie so `<html lang/dir>` and the provider start
 * correct (no RTL flash for Arabic); on the client we read the cookie directly
 * and the provider re-syncs from localStorage / the signed-in profile after
 * hydration.
 */
async function resolveInitialLanguage(): Promise<Language> {
  if (typeof document !== "undefined") {
    const match = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${LANGUAGE_COOKIE}=`));
    return match ? normalizeLanguage(match.split("=")[1]) : DEFAULT_LANGUAGE;
  }
  try {
    return await getPreferredLanguage();
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function NotFoundComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("common.pageNotFound")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("common.pageNotFoundBody")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("common.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const { t } = useTranslation();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("common.pageDidntLoad")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("common.somethingWentWrong")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("common.retry")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-input bg-background px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("common.goHome")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => ({ initialLanguage: await resolveInitialLanguage() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Kalm — Calm, private AI mental wellness support" },
      {
        name: "description",
        content:
          "Kalm blends an AI companion, mood and habit tracking, and guided CBT exercises into one calm daily wellness practice.",
      },
      { name: "author", content: "Kalm" },
      { property: "og:title", content: "Kalm — Calm, private AI mental wellness support" },
      {
        property: "og:description",
        content:
          "Kalm blends an AI companion, mood and habit tracking, and guided CBT exercises into one calm daily wellness practice.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Kalm — Calm, private AI mental wellness support" },
      {
        name: "twitter:description",
        content:
          "Kalm blends an AI companion, mood and habit tracking, and guided CBT exercises into one calm daily wellness practice.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b8a8eb2d-a030-4e5c-83ae-7e57cff9537b/id-preview-3d90d89c--3ccb18b6-d5dd-414d-a598-ddc4028d95df.lovable.app-1785497759896.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b8a8eb2d-a030-4e5c-83ae-7e57cff9537b/id-preview-3d90d89c--3ccb18b6-d5dd-414d-a598-ddc4028d95df.lovable.app-1785497759896.png",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito+Sans:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const { initialLanguage } = Route.useLoaderData();
  return (
    <html lang={initialLanguage} dir={languageDir(initialLanguage)}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { initialLanguage } = Route.useLoaderData();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider initialLanguage={initialLanguage}>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster />
      </LanguageProvider>
    </QueryClientProvider>
  );
}
