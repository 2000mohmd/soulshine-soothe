import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyStripeWebhook } from "@/lib/billing/stripe.server";

// stripe_webhook_events/profiles' new billing columns are added by the
// billing_and_checkin migration and aren't in the generated Database types
// yet (same situation date_of_birth was in — see onboarding.functions.ts).
// Widening to the untyped SupabaseClient (generic defaults to `any`) keeps
// this typechecking until Lovable regenerates types against the live schema.
function loose(client: unknown): SupabaseClient {
  return client as SupabaseClient;
}

/**
 * POST /api/public/hooks/stripe-webhook — register this URL in the Stripe
 * dashboard (Developers -> Webhooks), test mode first. Stripe signs every
 * delivery with STRIPE_WEBHOOK_SECRET, which the dashboard shows you once you
 * create the endpoint there (a different secret for the test-mode endpoint
 * than the eventual live one — both are just env var values, no code change).
 *
 * Subscribe this endpoint to: checkout.session.completed,
 * customer.subscription.created, customer.subscription.updated,
 * customer.subscription.deleted.
 *
 * The subscription events (not checkout.session.completed) are the source of
 * truth for `profiles.subscription_tier` — Stripe sends those on every plan
 * change, renewal, payment failure and cancellation, not just the first
 * purchase, so trusting them (keyed off stripe_customer_id) keeps the tier
 * correct without re-deriving it elsewhere.
 */
export const Route = createFileRoute("/api/public/hooks/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        let event: { id: string; type: string; data: { object: Record<string, unknown> } };
        try {
          event = await verifyStripeWebhook(rawBody, request.headers.get("stripe-signature"));
        } catch (error) {
          console.error("stripe webhook signature check failed", error);
          return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
        }

        const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
        const supabaseAdmin = loose(typedAdmin);

        // Idempotency: Stripe retries any delivery that doesn't 2xx, and the
        // same event can legitimately be redelivered. Skip work we've already done.
        const already = await supabaseAdmin
          .from("stripe_webhook_events")
          .select("id")
          .eq("id", event.id)
          .maybeSingle();
        if (already.data) {
          return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
        }

        try {
          await handleStripeEvent(supabaseAdmin, event);
        } catch (error) {
          console.error("stripe webhook handling failed", event.type, error);
          // 500 so Stripe retries — but only after logging, and idempotency above
          // means a subsequent successful retry won't double-apply anything we
          // DID manage to write before the failure (each write is its own upsert).
          return new Response(JSON.stringify({ error: "Handler failed" }), { status: 500 });
        }

        await supabaseAdmin
          .from("stripe_webhook_events")
          .insert({ id: event.id, type: event.type });

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    },
  },
});

async function handleStripeEvent(
  supabaseAdmin: SupabaseClient,
  event: { id: string; type: string; data: { object: Record<string, unknown> } },
): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as {
        id: string;
        customer: string;
        status: string;
        current_period_end: number;
        items: {
          data: {
            price: {
              id: string;
              lookup_key?: string | null;
              recurring?: { interval?: string | null } | null;
            };
          }[];
        };
        metadata?: { user_id?: string };
      };

      const price = subscription.items?.data?.[0]?.price ?? null;
      const active = subscription.status === "active" || subscription.status === "trialing";

      // Which plan and cadence the subscription is ACTUALLY on. The price object
      // is expanded in the event payload, so lookup_key ("pro_yearly") and
      // recurring.interval are usually right here; fall back to the pinned env
      // ids, then to a Stripe fetch, before giving up.
      let resolved = planFromLookupKey(price?.lookup_key) ?? planFromEnvPriceId(price?.id ?? null);
      let interval = resolved?.interval ?? intervalFromStripe(price?.recurring?.interval ?? null);

      if (!resolved && price?.id) {
        try {
          const fetched = await fetchStripePrice(price.id);
          resolved = planFromLookupKey(fetched.lookup_key);
          interval = resolved?.interval ?? intervalFromStripe(fetched.recurring?.interval ?? null);
        } catch (err) {
          console.error("stripe webhook: could not fetch price", price.id, err);
        }
      }

      if (active && !resolved) {
        // Don't silently downgrade a paying customer because we couldn't map the
        // price — keep them premium (the more generous of the two) and shout.
        console.error(
          "stripe webhook: active subscription on an unrecognised price",
          price?.id,
          price?.lookup_key,
        );
      }

      const tier = active ? (resolved?.plan ?? "premium") : "free";

      const update = {
        stripe_subscription_id:
          event.type === "customer.subscription.deleted" ? null : subscription.id,
        stripe_subscription_status: subscription.status,
        stripe_price_id: price?.id ?? null,
        stripe_billing_interval: active ? (interval ?? null) : null,
        subscription_current_period_end: new Date(
          subscription.current_period_end * 1000,
        ).toISOString(),
        subscription_tier: tier,
      };

      // stripe_customer_id is the reliable join key (set at checkout time);
      // metadata.user_id (set as subscription_data.metadata in checkout.ts) is
      // a redundant cross-check, logged rather than trusted blindly.
      const { error, count } = await supabaseAdmin
        .from("profiles")
        .update(update, { count: "exact" })
        .eq("stripe_customer_id", subscription.customer);
      if (error) throw error;
      if (!count) {
        console.error(
          "stripe webhook: no profile found for stripe_customer_id",
          subscription.customer,
          "metadata.user_id was",
          subscription.metadata?.user_id,
        );
      }
      break;
    }


    case "checkout.session.completed": {
      // Authoritative tier update happens on the subscription events above,
      // which Stripe fires around the same time. This is just a safety net
      // that stamps the customer id if, for any reason, it wasn't set before
      // checkout started (e.g. session created outside ensureStripeCustomer).
      const session = event.data.object as {
        customer: string | null;
        metadata?: { user_id?: string };
      };
      if (session.customer && session.metadata?.user_id) {
        await supabaseAdmin
          .from("profiles")
          .update({ stripe_customer_id: session.customer })
          .eq("id", session.metadata.user_id);
      }
      break;
    }

    default:
      // Unhandled event types are fine to ignore — Stripe sends far more than
      // we act on. Nothing to do.
      break;
  }
}
