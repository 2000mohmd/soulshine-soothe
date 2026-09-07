import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { KalmLogo } from "@/components/KalmLogo";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SafetyFooter } from "@/components/SafetyFooter";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in to Kalm" },
      {
        name: "description",
        content: "Get a secure sign-in link by email and start your private Kalm wellness check-ins.",
      },
      { property: "og:title", content: "Sign in to Kalm" },
      {
        property: "og:description",
        content: "Get a secure sign-in link by email and start your private Kalm wellness check-ins.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Enter a valid email address").max(255);

function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: "/chat", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function handleMagicLink() {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t("auth.checkDetails"));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: parsed.data,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      setLinkSent(true);
      toast.success(t("auth.linkSent"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("auth.linkFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error(provider === "apple" ? t("auth.appleFailed") : t("auth.googleFailed"));
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/chat", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col breathe-gradient">
      <div className="flex justify-end px-4 pt-4">
        <LanguageSwitcher className="w-auto" />
      </div>
      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-4">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="mb-8 flex items-center justify-center gap-2 font-display text-2xl"
          >
            <KalmLogo className="size-5 text-primary" aria-hidden />
            Kalm
          </Link>

          <div className="surface-soft p-7">
            {linkSent ? (
              <div className="space-y-4 text-center">
                <h1 className="text-2xl">{t("auth.linkSent")}</h1>
                <p className="text-muted-foreground">{t("auth.linkSentBody", { email })}</p>
                <Button
                  variant="outline"
                  className="w-full rounded-full"
                  disabled={busy}
                  onClick={() => void handleMagicLink()}
                >
                  {t("auth.sendAgain")}
                </Button>
                <button
                  type="button"
                  onClick={() => setLinkSent(false)}
                  className="w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  {t("auth.useDifferentEmail")}
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2 text-center">
                  <h1 className="text-2xl">{t("auth.magicTitle")}</h1>
                  <p className="text-sm text-muted-foreground">{t("auth.magicSubtitle")}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="magic-email">{t("auth.emailLabel")}</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleMagicLink();
                    }}
                    placeholder="you@example.com"
                  />
                </div>
                <Button
                  className="w-full rounded-full"
                  disabled={busy}
                  onClick={() => void handleMagicLink()}
                >
                  {t("auth.sendLink")}
                </Button>

                <div className="my-6 flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  {t("auth.or")}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full rounded-full"
                    disabled={busy}
                    onClick={() => void handleOAuth("google")}
                  >
                    {t("auth.continueWithGoogle")}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full rounded-full"
                    disabled={busy}
                    onClick={() => void handleOAuth("apple")}
                  >
                    {t("auth.continueWithApple")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("auth.termsPrefix")}{" "}
            <Link to="/legal" className="text-primary underline underline-offset-4">
              {t("auth.termsLink")}
            </Link>
            {t("auth.termsSuffix")}
          </p>
        </div>
      </main>
      <SafetyFooter />
    </div>
  );
}
