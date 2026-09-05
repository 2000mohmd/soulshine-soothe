// Member-facing billing actions for the web app. The /api/v1/billing/* routes
// stay as-is for the mobile client (bearer-token API); these server functions
// are the same operations for the signed-in web session.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BillingInterval, PaidPlan } from "./billing/plans";

export type CheckoutStart = { checkoutUrl: string } | { error: string };

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
    const { createCheckoutSession, ensureStripeCustomer, resolvePlanPriceId } = await import(
      "./billing/stripe.server"
    );
    try {
      const priceId = await resolvePlanPriceId(data.plan, data.interval);
      const { data: authUser } = await context.supabase.auth.getUser();
      const customerId = await ensureStripeCustomer(
        context.supabase,
        context.userId,
        authUser?.user?.email ?? null,
      );
      const session = await createCheckoutSession({
        customerId,
        priceId,
        userId: context.userId,
        successUrl: `${data.origin}/plans?checkout=success`,
        cancelUrl: `${data.origin}/plans?checkout=cancelled`,
      });
      if (!session.url) return { error: "Stripe did not return a checkout URL." };
      return { checkoutUrl: session.url };
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
