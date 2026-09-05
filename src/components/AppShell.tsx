import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { KalmLogo } from "@/components/KalmLogo";
import { getMyLanguage } from "@/lib/language.functions";
import { useTranslation } from "@/lib/i18n";
import { SafetyFooter } from "./SafetyFooter";
import { AppSidebar, SIDEBAR_NAV } from "./AppSidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // For signed-in users the profile is the source of truth for language.
  // Signed-out visitors have no bearer token, so skip the fetch entirely.
  const { t, language, setLanguage } = useTranslation();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session?.access_token));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.access_token));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const fetchLanguage = useServerFn(getMyLanguage);
  const { data: storedLanguage } = useQuery({
    queryKey: ["my-language"],
    queryFn: () => fetchLanguage().catch(() => null),
    enabled: signedIn,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    if (storedLanguage && storedLanguage !== language) setLanguage(storedLanguage);
  }, [storedLanguage, language, setLanguage]);


  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar open={sidebarOpen} onToggle={() => setSidebarOpen((open) => !open)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-only top bar; the rail takes over from md up. */}
        <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-border/70 bg-background/85 px-3 py-2 backdrop-blur md:hidden">
          <Link to="/chat" className="mr-auto flex items-center gap-2 font-display text-lg">
            <KalmLogo className="size-5 text-primary" aria-hidden />
            Kalm
          </Link>
          {SIDEBAR_NAV.map(({ to, labelKey, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              aria-label={t(labelKey)}
              className={`rounded-full p-2 ${
                pathname === to
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="size-4" aria-hidden />
            </Link>
          ))}
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <SafetyFooter />
      </div>
    </div>
  );
}
