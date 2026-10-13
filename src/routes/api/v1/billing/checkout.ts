import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { startCheckoutCore } from "@/lib/billing.functions";
import { ApiError, handle, json, readJson, requireAuth } from "../-shared";

const Body = z.object({
  // Which paid plan and billing cadence to buy. Defaults keep older clients
  // (which sent no plan at all) on the previous behaviour: premium monthly.
  plan: z.enum(["pro", "premium"]).default("premium"),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
  // Where Stripe sends the browser back after checkout. Optional — falls back
  // to the request's Origin header, then APP_BASE_URL, so this also works from
  // a plain `curl` test against the deployed app with no body at all.
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

function defaultBaseUrl(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const base = process.env["APP_BASE_URL"];
  if (base) return base;
  throw new ApiError(
    400,
    "Could not determine a redirect URL — pass successUrl/cancelUrl or set APP_BASE_URL.",
  );
}

/**
 * POST /api/v1/billing/checkout
 * Body: { plan: "pro" | "premium", interval: "monthly" | "yearly", successUrl?, cancelUrl? }
 *
 * Prices are resolved by src/lib/billing/plans.ts — either from the pinned env
 * vars (STRIPE_PRO_MONTHLY_PRICE_ID, STRIPE_PRO_YEARLY_PRICE_ID,
 * STRIPE_PREMIUM_MONTHLY_PRICE_ID, STRIPE_PREMIUM_YEARLY_PRICE_ID) or from the
 * Price lookup_key ("pro_monthly" etc.), which is identical in test and live.
 *
 * Switching plan or cadence on an EXISTING subscription happens in the Stripe
 * Customer Portal (/api/v1/billing/portal) — configure the portal to offer
 * these four prices with proration enabled.
 */
export const Route = createFileRoute("/api/v1/billing/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        handle(async () => {
          const { supabase, userId } = await requireAuth(request);
          const body = await readJson(request, Body).catch((err) => {
            if (err instanceof ApiError && err.status === 400) {
              return Body.parse({});
            }
            throw err;
          });

          const plan = body.plan ?? "premium";
          const interval = body.interval ?? "monthly";
          const base = defaultBaseUrl(request);

          let result;
          try {
            result = await startCheckoutCore(supabase, userId, {
              plan,
              interval,
              successUrl: body.successUrl ?? `${base}/settings?checkout=success`,
              cancelUrl: body.cancelUrl ?? `${base}/settings?checkout=cancelled`,
            });
          } catch (err) {
            throw new ApiError(
              500,
              err instanceof Error ? err.message : "Billing isn't configured",
            );
          }

          if ("error" in result) {
            throw result.error === "guardian-email-missing"
              ? new ApiError(
                  400,
                  "Teen accounts are paid for by a parent: add their email first (POST /api/v1/guardian-consent).",
                )
              : new ApiError(500, "Couldn't email the payment link to the parent.");
          }
          // Teens: { sentToGuardian: true } and no checkoutUrl.
          return json({ ...result, plan, interval });
        }),
    },
  },
});
