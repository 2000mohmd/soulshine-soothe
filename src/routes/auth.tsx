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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
        content: "Sign in or create your Kalm account to start your private wellness check-ins.",
      },
      { property: "og:title", content: "Sign in to Kalm" },
      {
        property: "og:description",
        content: "Sign in or create your Kalm account to start your private wellness check-ins.",
      },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(8, "Use at least 8 characters").max(72),
});

function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  async function handleForgotPassword() {
    const parsedEmail = z.string().trim().email().safeParse(email);
    if (!parsedEmail.success) {
      toast.error("Enter your email address first");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      toast.success("Password reset link sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send the reset link");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat", replace: true });
    });
  }, [navigate]);

  async function handlePassword(mode: "signin" | "signup") {
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t("auth.checkDetails"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setEmailSent(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
      }
      navigate({ to: "/chat", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("auth.genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleMagicLink() {
    const parsedEmail = z.string().trim().email("Enter a valid email address").safeParse(email);
    if (!parsedEmail.success) {
      toast.error(parsedEmail.error.issues[0]?.message ?? t("auth.checkDetails"));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: parsedEmail.data,
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw error;
      setMagicLinkSent(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("auth.genericError"));
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
            {magicLinkSent ? (
              <div className="space-y-3 text-center">
                <h1 className="text-2xl">{t("auth.checkEmail")}</h1>
                <p className="text-muted-foreground">{t("auth.magicLinkSent", { email })}</p>
                <button
                  type="button"
                  onClick={() => setMagicLinkSent(false)}
                  className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  {t("auth.useDifferentEmail")}
                </button>
              </div>
            ) : emailSent ? (
              <div className="space-y-3 text-center">
                <h1 className="text-2xl">{t("auth.checkEmail")}</h1>
                <p className="text-muted-foreground">{t("auth.confirmationSent", { email })}</p>
              </div>
            ) : (
              <Tabs defaultValue="signup">
                <TabsList className="w-full rounded-full">
                  <TabsTrigger value="signup" className="flex-1 rounded-full">
                    {t("auth.createAccount")}
                  </TabsTrigger>
                  <TabsTrigger value="signin" className="flex-1 rounded-full">
                    {t("auth.signIn")}
                  </TabsTrigger>
                </TabsList>

                {(["signup", "signin"] as const).map((mode) => (
                  <TabsContent key={mode} value={mode} className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`${mode}-email`}>{t("auth.emailLabel")}</Label>
                      <Input
                        id={`${mode}-email`}
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>
                    {!useMagicLink && (
                      <div className="space-y-2">
                        <Label htmlFor={`${mode}-password`}>{t("auth.passwordLabel")}</Label>
                        <Input
                          id={`${mode}-password`}
                          type="password"
                          autoComplete={mode === "signup" ? "new-password" : "current-password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder={t("auth.passwordPlaceholder")}
                        />
                      </div>
                    )}
                    <Button
                      className="w-full rounded-full"
                      disabled={busy}
                      onClick={() => void (useMagicLink ? handleMagicLink() : handlePassword(mode))}
                    >
                      {useMagicLink
                        ? t("auth.sendMagicLink")
                        : mode === "signup"
                          ? t("auth.createAccount")
                          : t("auth.signIn")}
                    </Button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setUseMagicLink((current) => !current)}
                      className="w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      {useMagicLink ? t("auth.usePasswordInstead") : t("auth.useMagicLinkInstead")}
                    </button>
                    {mode === "signin" && !useMagicLink && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleForgotPassword()}
                        className="w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      >
                        {resetSent ? "Reset link sent — send again" : "Forgot your password?"}
                      </button>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            )}

            {!emailSent && !magicLinkSent && (
              <>
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
              </>
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
