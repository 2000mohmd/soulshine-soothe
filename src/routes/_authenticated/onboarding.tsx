import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { KalmLogo } from "@/components/KalmLogo";
import { completeOnboarding, getMyProfile } from "@/lib/onboarding.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { SafetyFooter } from "@/components/SafetyFooter";
import { MINOR_AGE, MIN_AGE, ageFromDateOfBirth, maxAllowedDob } from "@/lib/age";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your Kalm profile" },
      {
        name: "description",
        content: "Tell Kalm who you are so your companion feels personal from the first message.",
      },
      { property: "og:title", content: "Set up your Kalm profile" },
      {
        property: "og:description",
        content: "Consent, mode selection, self-introduction and your baseline mood check-in.",
      },
    ],
  }),
  component: OnboardingPage,
});

// `value` is the stable enum stored in the DB; the label/body are display only.
const MODES = ["general", "condition", "teen", "org_member"] as const;

// The English string is what gets stored (feeds the AI context); the key drives
// what the user sees.
const GOALS = [
  { value: "Feel less anxious", key: "lessAnxious" },
  { value: "Sleep better", key: "sleepBetter" },
  { value: "Build a daily habit", key: "dailyHabit" },
  { value: "Understand my patterns", key: "patterns" },
  { value: "Handle work stress", key: "workStress" },
  { value: "Be kinder to myself", key: "kinder" },
] as const;

const STRESSORS = [
  { value: "Work", key: "work" },
  { value: "School", key: "school" },
  { value: "Family", key: "family" },
  { value: "Money", key: "money" },
  { value: "Health", key: "health" },
  { value: "Relationships", key: "relationships" },
  { value: "Loneliness", key: "loneliness" },
] as const;

const MOOD_SCORES = [1, 2, 3, 4, 5] as const;
const STEP_KEYS = ["consent", "mode", "about", "checkin"] as const;

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const saveOnboarding = useServerFn(completeOnboarding);

  const { data } = useQuery({ queryKey: ["my-profile"], queryFn: () => fetchProfile() });

  const [step, setStep] = useState(0);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [aiContextConsent, setAiContextConsent] = useState(true);
  const [dob, setDob] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [accountType, setAccountType] = useState<(typeof MODES)[number]>("general");
  const [preferredName, setPreferredName] = useState("");
  const [introText, setIntroText] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [stressors, setStressors] = useState<string[]>([]);
  const [diagnosis, setDiagnosis] = useState("");
  const [communication, setCommunication] = useState("");
  const [avoid, setAvoid] = useState("");
  const [inCare, setInCare] = useState(false);
  const [mood, setMood] = useState<number | null>(null);
  // "building" shows the plan-being-written screen, "ready" shows the plan.
  const [phase, setPhase] = useState<"form" | "building" | "ready">("form");
  const [plan, setPlan] = useState<{ plan: string | null; focus: string[] }>({
    plan: null,
    focus: [],
  });

  const age = dob ? ageFromDateOfBirth(dob) : null;
  const ageOk = age !== null && age >= MIN_AGE;
  const isMinor = age !== null && age < MINOR_AGE;

  useEffect(() => {
    // Don't bounce to chat while we're showing this person their new plan.
    if (phase === "form" && data?.profile?.onboarding_completed) {
      navigate({ to: "/chat", replace: true });
    }
    if (data?.profile?.preferred_name && !preferredName) {
      setPreferredName(data.profile.preferred_name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, phase]);

  // Under-18 is locked to teen mode; the mode step reflects this but the server
  // is the authority.
  useEffect(() => {
    if (isMinor && accountType !== "teen") setAccountType("teen");
  }, [isMinor, accountType]);

  const mutation = useMutation({
    mutationFn: () =>
      saveOnboarding({
        data: {
          preferred_name: preferredName.trim(),
          account_type: accountType,
          privacy_consent: true as const,
          ai_context_consent: aiContextConsent,
          date_of_birth: dob,
          guardian_email: isMinor ? guardianEmail.trim() || null : null,
          guardian_name: isMinor ? guardianName.trim() || null : null,
          intro_text: introText.trim(),
          goals,
          stressors,
          existing_diagnosis: diagnosis.trim(),
          communication_preference: communication.trim(),
          topics_to_avoid: avoid.trim(),
          in_professional_care: inCare,
          baseline_mood: mood ?? 3,
          baseline_tags: [],
        },
      }),
    onMutate: () => setPhase("building"),
    onSuccess: async (result) => {
      setPlan({
        plan: result?.care_plan ?? null,
        focus: result?.care_plan_focus ?? [],
      });
      setPhase("ready");
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: () => {
      setPhase("form");
      toast.error(t("onboarding.saveFailed"));
    },
  });

  const canContinue = [
    privacyConsent && ageOk && (!isMinor || guardianEmail.trim().includes("@")),
    Boolean(accountType),
    preferredName.trim().length > 0,
    mood !== null,
  ][step];

  if (phase !== "form") {
    return (
      <div className="flex min-h-screen flex-col breathe-gradient">
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-5 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-3xl bg-secondary">
            <KalmLogo className="size-7 text-primary" aria-hidden />
          </span>
          {phase === "building" ? (
            <>
              <h1 className="mt-6 font-display text-2xl">{t("onboarding.plan.buildingTitle")}</h1>
              <p className="mt-3 max-w-sm text-sm text-muted-foreground">
                {t("onboarding.plan.buildingBody")}
              </p>
              <Loader2 className="mt-6 size-5 animate-spin text-primary" aria-hidden />
            </>
          ) : (
            <>
              <h1 className="mt-6 font-display text-2xl">{t("onboarding.plan.readyTitle")}</h1>
              <p className="mt-3 max-w-md whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {plan.plan ?? t("onboarding.plan.fallbackBody")}
              </p>
              {plan.focus.length > 0 && (
                <ul className="mt-5 flex flex-wrap justify-center gap-2">
                  {plan.focus.map((item) => (
                    <li
                      key={item}
                      className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => navigate({ to: "/chat", replace: true })}
                className="mt-8 rounded-full bg-primary px-6 py-2.5 text-sm text-primary-foreground"
              >
                {t("onboarding.plan.start")}
              </button>
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col breathe-gradient">
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
        <div className="mb-8 flex items-center gap-2 font-display text-xl">
          <KalmLogo className="size-5 text-primary" aria-hidden />
          Kalm
        </div>

        <Progress value={((step + 1) / STEP_KEYS.length) * 100} className="h-1.5" />
        <p className="mt-3 text-sm text-muted-foreground">
          {t("onboarding.stepLabel", { current: step + 1, total: STEP_KEYS.length })} ·{" "}
          {t(`onboarding.steps.${STEP_KEYS[step]}`)}
        </p>

        <div className="surface-soft mt-6 p-7">
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl">{t("onboarding.consent.title")}</h1>
                <p className="mt-3 text-muted-foreground">{t("onboarding.consent.body")}</p>
              </div>
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={privacyConsent}
                  onCheckedChange={(value) => setPrivacyConsent(value === true)}
                  className="mt-1"
                />
                <span>{t("onboarding.consent.agreePrivacy")}</span>
              </label>
              <div className="space-y-2">
                <Label htmlFor="dob">{t("onboarding.consent.dobLabel")}</Label>
                <Input
                  id="dob"
                  type="date"
                  value={dob}
                  max={maxAllowedDob()}
                  onChange={(event) => setDob(event.target.value)}
                  className="w-full sm:w-56"
                />
                <p className="text-xs text-muted-foreground">{t("onboarding.consent.dobHint")}</p>
                {dob && !ageOk && (
                  <p className="text-xs font-medium text-destructive">
                    {t("onboarding.consent.under13", { min: MIN_AGE })}
                  </p>
                )}
              </div>
              {isMinor && (
                <div className="space-y-2 rounded-2xl border border-primary/25 bg-primary/5 p-4">
                  <Label htmlFor="guardian-email">
                    {t("onboarding.consent.guardianTitle")}
                  </Label>
                  <Input
                    id="guardian-email"
                    type="email"
                    value={guardianEmail}
                    placeholder={t("guardian.emailLabel")}
                    onChange={(event) => setGuardianEmail(event.target.value)}
                    className="w-full sm:w-72"
                  />
                  <Input
                    id="guardian-name"
                    value={guardianName}
                    placeholder={t("guardian.nameLabel")}
                    onChange={(event) => setGuardianName(event.target.value)}
                    className="w-full sm:w-72"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("onboarding.consent.guardianHint")}
                  </p>
                </div>
              )}
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={aiContextConsent}
                  onCheckedChange={(value) => setAiContextConsent(value === true)}
                  className="mt-1"
                />
                <span>{t("onboarding.consent.aiOptIn")}</span>
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-3xl">{t("onboarding.mode.title")}</h1>
                <p className="mt-3 text-muted-foreground">{t("onboarding.mode.body")}</p>
                {isMinor && (
                  <p className="mt-3 rounded-xl bg-secondary/60 px-4 py-2 text-sm text-secondary-foreground">
                    {t("onboarding.mode.teenLocked")}
                  </p>
                )}
              </div>
              <div className="space-y-3">
                {MODES.map((value) => {
                  const locked = isMinor && value !== "teen";
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={locked}
                      onClick={() => setAccountType(value)}
                      className={`flex w-full items-start gap-3 rounded-2xl border p-5 text-left ${
                        locked
                          ? "cursor-not-allowed border-border bg-card opacity-40"
                          : accountType === value
                            ? "border-primary bg-secondary"
                            : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      <span className="flex-1">
                        <span className="block font-semibold">
                          {t(`onboarding.modes.${value}.title`)}
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {t(`onboarding.modes.${value}.body`)}
                        </span>
                      </span>
                      {accountType === value && (
                        <Check className="mt-1 size-5 text-primary" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl">{t("onboarding.about.title")}</h1>
                <p className="mt-3 text-muted-foreground">{t("onboarding.about.body")}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t("onboarding.about.nameLabel")}</Label>
                <Input
                  id="name"
                  value={preferredName}
                  maxLength={60}
                  onChange={(event) => setPreferredName(event.target.value)}
                  placeholder={t("onboarding.about.namePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="intro">{t("onboarding.about.introLabel")}</Label>
                <Textarea
                  id="intro"
                  value={introText}
                  maxLength={2000}
                  rows={5}
                  onChange={(event) => setIntroText(event.target.value)}
                  placeholder={t("onboarding.about.introPlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("onboarding.about.goalsLabel")}</Label>
                <div className="flex flex-wrap gap-2">
                  {GOALS.map((goal) => (
                    <Chip
                      key={goal.key}
                      label={t(`onboarding.goals.${goal.key}`)}
                      active={goals.includes(goal.value)}
                      onClick={() => setGoals(toggle(goals, goal.value))}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("onboarding.about.stressorsLabel")}</Label>
                <div className="flex flex-wrap gap-2">
                  {STRESSORS.map((item) => (
                    <Chip
                      key={item.key}
                      label={t(`onboarding.stressors.${item.key}`)}
                      active={stressors.includes(item.value)}
                      onClick={() => setStressors(toggle(stressors, item.value))}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="communication">{t("onboarding.about.commLabel")}</Label>
                <Input
                  id="communication"
                  value={communication}
                  maxLength={120}
                  onChange={(event) => setCommunication(event.target.value)}
                  placeholder={t("onboarding.about.commPlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="avoid">{t("onboarding.about.avoidLabel")}</Label>
                <Input
                  id="avoid"
                  value={avoid}
                  maxLength={500}
                  onChange={(event) => setAvoid(event.target.value)}
                  placeholder={t("onboarding.about.avoidPlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="diagnosis">{t("onboarding.about.diagnosisLabel")}</Label>
                <Input
                  id="diagnosis"
                  value={diagnosis}
                  maxLength={200}
                  onChange={(event) => setDiagnosis(event.target.value)}
                  placeholder={t("onboarding.about.diagnosisPlaceholder")}
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={inCare}
                  onCheckedChange={(value) => setInCare(value === true)}
                  className="mt-1"
                />
                <span>{t("onboarding.about.inCare")}</span>
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl">{t("onboarding.checkin.title")}</h1>
                <p className="mt-3 text-muted-foreground">{t("onboarding.checkin.body")}</p>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {MOOD_SCORES.map((score) => (
                  <button
                    key={score}
                    type="button"
                    onClick={() => setMood(score)}
                    className={`rounded-2xl border px-2 py-5 text-center text-sm ${
                      mood === score
                        ? "border-primary bg-secondary font-semibold"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    <span className="block text-2xl">{"○●"[mood === score ? 1 : 0]}</span>
                    <span className="mt-2 block">{t(`onboarding.moods.${score}`)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              className="rounded-full"
              disabled={step === 0}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
            >
              <ArrowLeft className="size-4" aria-hidden />
              {t("common.back")}
            </Button>
            {step < STEP_KEYS.length - 1 ? (
              <Button
                className="rounded-full px-6"
                disabled={!canContinue}
                onClick={() => setStep((value) => value + 1)}
              >
                {t("common.continue")}
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button
                className="rounded-full px-6"
                disabled={!canContinue || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? t("common.saving") : t("onboarding.finishSetup")}
              </Button>
            )}
          </div>
        </div>
      </main>
      <SafetyFooter />
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm ${
        active
          ? "border-primary bg-secondary font-semibold text-secondary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}
