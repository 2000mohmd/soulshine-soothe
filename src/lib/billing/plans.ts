// The paid plan catalogue: plan + billing interval -> Stripe Price.
//
// Two ways to resolve a Price, in this order:
//   1. An explicit env var (STRIPE_PRO_MONTHLY_PRICE_ID etc.) — set these to the
//      real `price_...` ids when you want to pin them.
//   2. The Price `lookup_key` ("pro_monthly", "pro_yearly", "premium_monthly",
//      "premium_yearly"), which is stable across test and live mode, resolved at
//      request time via the Stripe API.
//
// Prices (USD): Pro $18/mo, $180/yr. Premium $50/mo, $500/yr (10x monthly, i.e.
// two months free, as a literal yearly price rather than a coupon).

export type PaidPlan = "pro" | "premium";
export type BillingInterval = "monthly" | "yearly";

export const PAID_PLANS: PaidPlan[] = ["pro", "premium"];

const ENV_KEYS: Record<PaidPlan, Record<BillingInterval, string>> = {
  pro: {
    monthly: "STRIPE_PRO_MONTHLY_PRICE_ID",
    yearly: "STRIPE_PRO_YEARLY_PRICE_ID",
  },
  premium: {
    monthly: "STRIPE_PREMIUM_MONTHLY_PRICE_ID",
    yearly: "STRIPE_PREMIUM_YEARLY_PRICE_ID",
  },
};

const LOOKUP_KEYS: Record<PaidPlan, Record<BillingInterval, string>> = {
  pro: { monthly: "pro_monthly", yearly: "pro_yearly" },
  premium: { monthly: "premium_monthly", yearly: "premium_yearly" },
};

export function planLookupKey(plan: PaidPlan, interval: BillingInterval): string {
  return LOOKUP_KEYS[plan][interval];
}

/** The pinned Price id from env, when one is configured. */
export function planPriceIdFromEnv(plan: PaidPlan, interval: BillingInterval): string | null {
  const legacy =
    plan === "premium" && interval === "monthly" ? process.env["STRIPE_PREMIUM_PRICE_ID"] : null;
  return process.env[ENV_KEYS[plan][interval]] ?? legacy ?? null;
}

/** Reverse map: identify a plan/interval from a Price id via the env pins. */
export function planFromEnvPriceId(
  priceId: string | null | undefined,
): { plan: PaidPlan; interval: BillingInterval } | null {
  if (!priceId) return null;
  for (const plan of PAID_PLANS) {
    for (const interval of ["monthly", "yearly"] as BillingInterval[]) {
      if (planPriceIdFromEnv(plan, interval) === priceId) return { plan, interval };
    }
  }
  return null;
}

/** Reverse map from a Price `lookup_key` ("pro_yearly" -> pro + yearly). */
export function planFromLookupKey(
  lookupKey: string | null | undefined,
): { plan: PaidPlan; interval: BillingInterval } | null {
  if (!lookupKey) return null;
  for (const plan of PAID_PLANS) {
    for (const interval of ["monthly", "yearly"] as BillingInterval[]) {
      if (LOOKUP_KEYS[plan][interval] === lookupKey) return { plan, interval };
    }
  }
  return null;
}

/** Stripe's `recurring.interval` ("month"/"year") -> our interval naming. */
export function intervalFromStripe(interval: string | null | undefined): BillingInterval | null {
  if (interval === "month") return "monthly";
  if (interval === "year") return "yearly";
  return null;
}
