import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  deleteMyAccount,
  deleteMyData,
  getMyProfile,
  setEmailOptOut,
} from "@/lib/onboarding.functions";
import { AppShell } from "@/components/AppShell";
import { KalmMemoryPanel } from "@/components/KalmMemoryPanel";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { YourDataSection } from "@/components/YourDataSection";
import { useTranslation } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Your profile & data — Kalm" },
      {
        name: "description",
        content:
          "Review what Kalm knows about you, your account mode, and delete your data anytime.",
      },
      { property: "og:title", content: "Your profile & data — Kalm" },
      {
        property: "og:description",
        content: "Review what Kalm knows about you and delete your data anytime.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const wipeData = useServerFn(deleteMyData);
  const removeAccount = useServerFn(deleteMyAccount);
  const emailPref = useServerFn(setEmailOptOut);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
  });

  const mutation = useMutation({
    mutationFn: () => wipeData(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success(t("settings.deleteData.done"));
    },
    onError: () => toast.error(t("settings.deleteData.error")),
  });

  // Distinct from `mutation` above (data wipe, account stays). This removes the
  // account entirely, so on success we sign out locally and leave the app.
  const accountDeletion = useMutation({
    mutationFn: () => removeAccount(),
    onSuccess: async () => {
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success(t("settings.deleteAccount.done"));
      navigate({ to: "/", replace: true });
    },
    onError: () => toast.error(t("settings.deleteAccount.error")),
  });

  // Distinct from `mutation` / `accountDeletion`: just flips the proactive-email
  // opt-out. `email_opt_out` isn't in the generated profile type yet.
  const emailMutation = useMutation({
    mutationFn: (opt_out: boolean) => emailPref({ data: { opt_out } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-profile"] }),
    onError: () => toast.error(t("settings.saveError")),
  });

  const profile = data?.profile;
  const intro = data?.intro;
  const emailOptOut = (profile as { email_opt_out?: boolean } | null)?.email_opt_out ?? false;

  return (
    <AppShell>
      {isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <header>
            <h1 className="text-3xl sm:text-4xl">{t("settings.title")}</h1>
            <p className="mt-2 text-muted-foreground">{t("settings.subtitle")}</p>
          </header>

          <section className="surface-soft p-6">
            <h2 className="text-lg">{t("settings.account")}</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Row label={t("settings.preferredName")} value={profile?.preferred_name ?? "—"} />
              <Row
                label={t("settings.mode")}
                value={
                  profile?.account_type
                    ? t(`settings.modes.${profile.account_type}`)
                    : "—"
                }
              />
              <Row
                label={t("settings.aiPersonalization")}
                value={profile?.ai_context_consent ? t("settings.on") : t("settings.off")}
              />
              <Row
                label={t("settings.consentAccepted")}
                value={
                  profile?.consent_accepted_at
                    ? new Date(profile.consent_accepted_at).toLocaleDateString()
                    : "—"
                }
              />
            </dl>
          </section>

          <section className="surface-soft p-6">
            <h2 className="text-lg">{t("language.sectionTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("language.sectionDescription")}</p>
            <div className="mt-4">
              <LanguageSwitcher />
            </div>
          </section>

          <section className="surface-soft p-6">
            <h2 className="text-lg">{t("settings.emails.title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("settings.emails.body")}</p>
            <label className="mt-4 flex items-center justify-between gap-4">
              <span className="text-sm">{t("settings.emails.toggle")}</span>
              <Switch
                checked={!emailOptOut}
                disabled={emailMutation.isPending || isPending}
                onCheckedChange={(on) => emailMutation.mutate(!on)}
                aria-label={t("settings.emails.toggle")}
              />
            </label>
          </section>

          <section className="surface-soft p-6">
            <h2 className="text-lg">{t("settings.intro.title")}</h2>
            <p className="mt-3 whitespace-pre-wrap text-muted-foreground">
              {intro?.intro_text || t("settings.intro.empty")}
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Row label={t("settings.intro.goals")} value={(intro?.goals ?? []).join(", ") || "—"} />
              <Row label={t("settings.intro.stressors")} value={(intro?.stressors ?? []).join(", ") || "—"} />
              <Row
                label={t("settings.intro.communication")}
                value={intro?.communication_preference || "—"}
              />
              <Row label={t("settings.intro.avoid")} value={intro?.topics_to_avoid || "—"} />
              <Row
                label={t("settings.intro.professional")}
                value={
                  intro?.in_professional_care
                    ? t("settings.intro.professionalYes")
                    : t("settings.intro.professionalNo")
                }
              />
              <Row label={t("settings.intro.diagnosis")} value={intro?.existing_diagnosis || "—"} />
            </div>
          </section>

          <section className="surface-soft p-6">
            <h2 className="text-lg">{t("settings.support.title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("settings.support.body")}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild className="rounded-full">
                <Link to="/support">{t("settings.support.message")}</Link>
              </Button>
              <Button asChild variant="secondary" className="rounded-full">
                <Link to="/care">{t("settings.support.resources")}</Link>
              </Button>
            </div>
          </section>

          <KalmMemoryPanel />

          <YourDataSection />

          <section className="surface-soft p-6">
            <h2 className="text-lg">{t("settings.deleteData.title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("settings.deleteData.body")}</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="mt-5 rounded-full">
                  {t("settings.deleteData.button")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("settings.deleteData.confirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("settings.deleteData.confirmBody")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("settings.deleteData.keep")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => mutation.mutate()}
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? t("settings.deleteData.deleting") : t("settings.deleteData.confirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>

          <section className="surface-soft border border-destructive/30 p-6">
            <h2 className="text-lg text-destructive">{t("settings.deleteAccount.title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("settings.deleteAccount.body")}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{t("settings.deleteAccount.note")}</p>
            <AlertDialog onOpenChange={(open) => !open && setDeleteConfirmText("")}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="mt-5 rounded-full">
                  {t("settings.deleteAccount.button")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("settings.deleteAccount.confirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("settings.deleteAccount.confirmBody")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("settings.deleteAccount.keep")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => accountDeletion.mutate()}
                    disabled={deleteConfirmText !== "DELETE" || accountDeletion.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {accountDeletion.isPending
                      ? t("settings.deleteAccount.deleting")
                      : t("settings.deleteAccount.confirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>

          <p className="text-sm text-muted-foreground">
            {t("settings.legalPrefix")}{" "}
            <Link to="/legal" className="font-semibold text-primary underline underline-offset-4">
              {t("settings.legalLink")}
            </Link>
            .
          </p>
        </div>
      )}
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
