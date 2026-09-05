import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getEntitlements } from "@/lib/entitlements.functions";
import { openBillingPortal, startPlanCheckout } from "@/lib/billing.functions";
import type { BillingInterval, PaidPlan } from "@/lib/billing/plans";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({
    meta: [
      { title: "Plans and billing — Kalm" },
      {
        name: "description",
        content:
          "Compare Kalm's Free, Pro and Premium plans — daily companion messages, weekly voice calls and billing you can change any time.",
      },
      { property: "og:title", content: "Plans and billing — Kalm" },
      {
        property: "og:description",
        content: "Free, Pro and Premium: daily companion messages and weekly voice calls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { checkout?: string } => ({
    checkout: typeof search.checkout === "string" ? search.checkout : undefined,
  }),
  component: PlansPage,
});

type Tier = "free" | "pro" | "premium";

const PRICES: Record<Exclude<Tier, "free">, Record<BillingInterval, number>> = {
  pro: { monthly: 18, yearly: 180 },
  premium: { monthly: 50, yearly: 500 },
};

const TIERS: { id: Tier; featureKeys: string[] }[] = [
  { id: "free", featureKeys: ["messages", "calls", "tracking"] },
  { id: "pro", featureKeys: ["messages", "calls", "history", "export"] },
  { id: "premium", featureKeys: ["messages", "calls", "history", "export", "priority"] },
];

function PlansPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { checkout } = Route.useSearch();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [pending, setPending] = useState<PaidPlan | null>(null);

  const fetchEntitlements = useServerFn(getEntitlements);
  const { data: entitlements, isPending } = useQuery({
    queryKey: ["entitlements"],
    queryFn: () => fetchEntitlements(),
  });

  const beginCheckout = useServerFn(startPlanCheckout);
  const beginPortal = useServerFn(openBillingPortal);

  const checkoutMutation = useMutation({
    mutationFn: async (plan: PaidPlan) => {
      setPending(plan);
      return beginCheckout({ data: { plan, interval, origin: window.location.origin } });
    },
    onSuccess: (result) => {
      if ("checkoutUrl" in result) {
        window.location.href = result.checkoutUrl;
        return;
      }
      setPending(null);
      toast.error(t("plans.checkoutFailed"), { description: result.error });
    },
    onError: () => {
      setPending(null);
      toast.error(t("plans.checkoutFailed"));
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => beginPortal({ data: { origin: window.location.origin } }),
    onSuccess: (result) => {
      if ("portalUrl" in result) {
        window.location.href = result.portalUrl;
        return;
      }
      toast.error(
        result.error === "no-subscription" ? t("plans.noSubscription") : t("plans.portalFailed"),
        result.error === "no-subscription" ? undefined : { description: result.error },
      );
    },
    onError: () => toast.error(t("plans.portalFailed")),
  });

  const currentTier = (entitlements?.tier ?? "free") as string;
  const isOrg = currentTier === "org";

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="max-w-2xl">
          <h1 className="text-3xl sm:text-4xl">{t("plans.title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("plans.subtitle")}</p>
        </header>

        {checkout === "success" && (
          <div className="surface-soft border border-primary/30 p-4 text-sm">
            <p className="font-medium">{t("plans.successTitle")}</p>
            <p className="mt-1 text-muted-foreground">{t("plans.successBody")}</p>
          </div>
        )}
        {checkout === "cancelled" && (
          <div className="surface-soft p-4 text-sm text-muted-foreground">
            {t("plans.cancelled")}
          </div>
        )}

        {/* Monthly / yearly cadence */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-muted p-1">
            {(["monthly", "yearly"] as BillingInterval[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setInterval(option)}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  interval === option
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                {t(`plans.interval.${option}`)}
              </button>
            ))}
          </div>
          <span className="text-xs text-primary">{t("plans.yearlyHint")}</span>
        </div>

        {isPending ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-80 rounded-3xl" />
            <Skeleton className="h-80 rounded-3xl" />
            <Skeleton className="h-80 rounded-3xl" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {TIERS.map(({ id, featureKeys }) => {
              const isCurrent = currentTier === id;
              const price = id === "free" ? 0 : PRICES[id][interval];
              const highlight = id === "pro";
              return (
                <section
                  key={id}
                  className={`surface-soft flex flex-col p-6 ${
                    highlight ? "border border-primary/40" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg">{t(`plans.tiers.${id}.name`)}</h2>
                    {isCurrent && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                        {t("plans.currentPlan")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(`plans.tiers.${id}.tagline`)}
                  </p>

                  <p className="mt-5 font-display text-3xl">
                    {price === 0 ? (
                      t("plans.free")
                    ) : (
                      <>
                        ${price}
                        <span className="text-sm text-muted-foreground">
                          {" "}
                          {t(`plans.per.${interval}`)}
                        </span>
                      </>
                    )}
                  </p>

                  <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                    {featureKeys.map((key) => (
                      <li key={key} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        <span>{t(`plans.tiers.${id}.features.${key}`)}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    {id === "free" ? (
                      <Button variant="outline" className="w-full" disabled>
                        {isCurrent ? t("plans.currentPlan") : t("plans.tiers.free.name")}
                      </Button>
                    ) : isCurrent || isOrg ? (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => portalMutation.mutate()}
                        disabled={portalMutation.isPending || isOrg}
                      >
                        {portalMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          t("plans.manage")
                        )}
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        variant={highlight ? "default" : "outline"}
                        onClick={() => checkoutMutation.mutate(id as PaidPlan)}
                        disabled={pending !== null}
                      >
                        {pending === id ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          t("plans.choose", { plan: t(`plans.tiers.${id}.name`) })
                        )}
                      </Button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* Usage today, so the numbers on the cards feel real */}
        {entitlements && (
          <section className="surface-soft p-6 text-sm">
            <h2 className="text-lg">{t("plans.usageTitle")}</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t("plans.usageMessages")}</dt>
                <dd className="mt-1 font-medium">
                  {entitlements.chat.usedToday} / {entitlements.chat.dailyLimit}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("plans.usageCalls")}</dt>
                <dd className="mt-1 font-medium">
                  {entitlements.voice.enabled
                    ? `${entitlements.voice.usedThisWeek} / ${entitlements.voice.weeklyLimit}`
                    : t("plans.usageCallsNone")}
                </dd>
              </div>
            </dl>
            {entitlements.voice.nextCallAvailableAt && (
              <p className="mt-4 text-muted-foreground">
                {t("plans.nextCall", {
                  date: new Date(entitlements.voice.nextCallAvailableAt).toLocaleDateString(),
                })}
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
              >
                <ExternalLink className="size-4" aria-hidden />
                {t("plans.manage")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/support" })}>
                {t("plans.contactSupport")}
              </Button>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
