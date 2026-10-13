// Member-facing billing actions for the web app. The /api/v1/billing/* routes
// stay as-is for the mobile client (bearer-token API); these server functions
// are the same operations for the signed-in web session.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { BillingInterval, PaidPlan } from "./billing/plans";
import { TRIAL_DAYS } from "./chat-limits";

export type CheckoutStart =
  | { checkoutUrl: string; trialDays: number }
  // Teen accounts: the link was emailed to their parent/guardian instead.
  | { sentToGuardian: true; trialDays: number }
  | { error: string };

/**
 * Checkout, shared by the web (startPlanCheckout) and mobile
 * (POST /api/v1/billing/checkout) entry points.
 *
 * - Pro and Premium start with a TRIAL_DAYS free trial (card collected, no
 *   charge until it ends), once per person: anyone who has ever had a
 *   subscription pays from day one.
 * - Teens can't pay: the Checkout link is emailed to the guardian on file and
 *   lands back on the public home page, since the guardian has no account.
 *
 * Returns { error: "guardian-email-missing" | "guardian-email-failed" } for the
 * teen cases; Stripe/config failures throw.
 */
export async function startCheckoutCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { plan: PaidPlan; interval: BillingInterval; successUrl: string; cancelUrl: string },
): Promise<CheckoutStart> {
  const { createCheckoutSession, ensureStripeCustomer, resolvePlanPriceId } =
    await import("./billing/stripe.server");
  const [profile, authUser] = await Promise.all([
    supabase
      .from("profiles")
      .select("account_type, preferred_name, stripe_subscription_status")
      .eq("id", userId)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const trialDays = profile.data?.stripe_subscription_status ? 0 : TRIAL_DAYS;

  const teen = profile.data?.account_type === "teen";
  let guardian: { guardian_email: string; guardian_name: string | null } | null = null;
  if (teen) {
    const row = await supabase
      .from("guardian_consents")
      .select("guardian_email, guardian_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (!row.data?.guardian_email) return { error: "guardian-email-missing" };
    guardian = row.data;
  }

  const priceId = await resolvePlanPriceId(input.plan, input.interval);
  const customerId = await ensureStripeCustomer(
    supabase,
    userId,
    authUser.data.user?.email ?? null,
  );
  const publicHome = `${new URL(input.successUrl).origin}/`;
  const session = await createCheckoutSession({
    customerId,
    priceId,
    userId,
    trialDays,
    successUrl: guardian ? publicHome : input.successUrl,
    cancelUrl: guardian ? publicHome : input.cancelUrl,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  if (!guardian) return { checkoutUrl: session.url, trialDays };

  const { sendGuardianPaymentEmail } = await import("./guardian-consent.server");
  const sent = await sendGuardianPaymentEmail({
    guardianEmail: guardian.guardian_email,
    guardianName: guardian.guardian_name,
    teenName: profile.data?.preferred_name ?? null,
    planName: input.plan === "premium" ? "Premium" : "Pro",
    trialDays,
    checkoutUrl: session.url,
  });
  return sent ? { sentToGuardian: true, trialDays } : { error: "guardian-email-failed" };
}

/** Starts Stripe Checkout for a plan + cadence and returns the hosted URL. */
export const startPlanCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { plan: PaidPlan; interval: BillingInterval; origin: string }) => {
    if (input.plan !== "pro" && input.plan !== "premium") throw new Error("Unknown plan");
    if (input.interval !== "monthly" && input.interval !== "yearly") {
      throw new Error("Unknown billing interval");
    }
    if (!/^https?:\/\//.test(input.origin)) throw new Error("Invalid origin");
    return input;
  })
  .handler(async ({ data, context }): Promise<CheckoutStart> => {
    try {
      return await startCheckoutCore(context.supabase, context.userId, {
        plan: data.plan,
        interval: data.interval,
        successUrl: `${data.origin}/plans?checkout=success`,
        cancelUrl: `${data.origin}/plans?checkout=cancelled`,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Checkout could not be started." };
    }
  });

export type PortalStart = { portalUrl: string } | { error: string };

/** Opens the Stripe Customer Portal (switch plan/cadence, update card, cancel). */
export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { origin: string }) => {
    if (!/^https?:\/\//.test(input.origin)) throw new Error("Invalid origin");
    return input;
  })
  .handler(async ({ data, context }): Promise<PortalStart> => {
    const { createBillingPortalSession } = await import("./billing/stripe.server");
    try {
      const profile = await context.supabase
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", context.userId)
        .maybeSingle();
      const customerId = (profile.data as Record<string, unknown> | null)?.[
        "stripe_customer_id"
      ] as string | null | undefined;
      if (!customerId) return { error: "no-subscription" };
      const session = await createBillingPortalSession({
        customerId,
        returnUrl: `${data.origin}/plans`,
      });
      return { portalUrl: session.url };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Billing portal unavailable." };
    }
  });
