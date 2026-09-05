// Stripe integration — plain REST + Web Crypto, deliberately not the `stripe`
// npm SDK. This app deploys to Cloudflare Workers (see .output/server), and the
// official SDK assumes a Node runtime; a handful of `fetch` calls plus
// `crypto.subtle` for webhook signature verification works identically in
// Workers, Node, and tests, with zero new dependency.
//
// TEST -> LIVE: everything here reads STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
// from the environment. Switching from a test key (sk_test_...) to a live key
// (sk_live_...) is purely a secret rotation — no code or schema change. Until
// STRIPE_SECRET_KEY is set, every call below throws a clear "not configured"
// error rather than silently no-opping.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  planLookupKey,
  planPriceIdFromEnv,
  type BillingInterval,
  type PaidPlan,
} from "./plans";

const STRIPE_API = "https://api.stripe.com/v1";
// Managed-connection fallback: when there is no own STRIPE_SECRET_KEY, the same
// REST calls are proxied through Lovable's connector gateway, which attaches the
// real Stripe secret. STRIPE_SANDBOX_API_KEY / STRIPE_LIVE_API_KEY are gateway
// connection identifiers, not Stripe keys.
const GATEWAY_API = "https://connector-gateway.lovable.dev/stripe/v1";

type Transport = { base: string; headers: Record<string, string> };

function transport(): Transport {
  const own = process.env["STRIPE_SECRET_KEY"];
  if (own) return { base: STRIPE_API, headers: { Authorization: `Bearer ${own}` } };

  const connectionKey =
    process.env["STRIPE_LIVE_API_KEY"] ?? process.env["STRIPE_SANDBOX_API_KEY"] ?? null;
  const lovableKey = process.env["LOVABLE_API_KEY"] ?? null;
  if (connectionKey && lovableKey) {
    return {
      base: GATEWAY_API,
      headers: {
        Authorization: `Bearer ${connectionKey}`,
        "X-Connection-Api-Key": connectionKey,
        "Lovable-API-Key": lovableKey,
      },
    };
  }
  throw new Error("Stripe is not configured yet (no STRIPE_SECRET_KEY or managed connection).");
}

/** Stripe's API takes classic `application/x-www-form-urlencoded`, including for nested objects. */
function toForm(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  return search.toString();
}

async function stripeRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const { base, headers } = transport();
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
      // Pin an API version so Stripe dashboard upgrades never silently change
      // this integration's request/response shape underneath us.
      "Stripe-Version": "2024-06-20",
    },
    // Stripe accepts a form-encoded body on DELETE too (e.g. subscription
    // cancellation's optional `prorate`/`invoice_now`), so only GET omits one.
    ...(method !== "GET" ? { body: toForm(params ?? {}) } : {}),
  });

  const payload = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Stripe API error (${response.status})`);
  }
  return payload;
}

export type StripePrice = {
  id: string;
  lookup_key?: string | null;
  recurring?: { interval?: string | null } | null;
};

/**
 * The Stripe Price id for a plan + interval: the pinned env var when set,
 * otherwise resolved from the Price `lookup_key` (stable across test and live).
 */
export async function resolvePlanPriceId(
  plan: PaidPlan,
  interval: BillingInterval,
): Promise<string> {
  const pinned = planPriceIdFromEnv(plan, interval);
  if (pinned) return pinned;

  const lookupKey = planLookupKey(plan, interval);
  const found = await stripeRequest<{ data: StripePrice[] }>(
    "GET",
    `/prices?active=true&limit=1&lookup_keys[0]=${encodeURIComponent(lookupKey)}`,
  );
  const price = found.data?.[0];
  if (!price?.id) {
    throw new Error(
      `No Stripe price found for ${plan} ${interval} (lookup_key "${lookupKey}"). Set ${plan === "pro" ? "STRIPE_PRO" : "STRIPE_PREMIUM"}_${interval.toUpperCase()}_PRICE_ID or create the price.`,
    );
  }
  return price.id;
}

/** Fetches a Price so a webhook can derive plan + billing interval from it. */
export async function fetchStripePrice(priceId: string): Promise<StripePrice> {
  return stripeRequest<StripePrice>("GET", `/prices/${priceId}`);
}


export type StripeCustomer = { id: string; email: string | null };

/** Finds or creates the Stripe Customer for a user, storing the id on `profiles`. */
export async function ensureStripeCustomer(
  // Untyped SupabaseClient (generic defaults to `any`) rather than
  // SupabaseClient<Database>, because stripe_customer_id is added by this
  // migration and isn't in the generated types yet — same situation
  // date_of_birth was in (see onboarding.functions.ts). Regenerate the types
  // and this can go back to the strict client type.
  supabase: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<string> {
  const existing = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  const existingId = existing.data?.["stripe_customer_id"] as string | null | undefined;
  if (existingId) return existingId;

  const customer = await stripeRequest<StripeCustomer>("POST", "/customers", {
    email: email ?? undefined,
    "metadata[user_id]": userId,
  });

  await supabase.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", userId);
  return customer.id;
}

export type CheckoutSession = { id: string; url: string | null };

/**
 * Creates a Stripe Checkout Session for the premium subscription.
 * `priceId` is the Stripe Price id (STRIPE_PREMIUM_PRICE_ID) — either supplied
 * by the caller or read from env by the route handler.
 */
export async function createCheckoutSession(input: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  userId: string;
}): Promise<CheckoutSession> {
  return stripeRequest<CheckoutSession>("POST", "/checkout/sessions", {
    customer: input.customerId,
    mode: "subscription",
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": 1,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "subscription_data[metadata][user_id]": input.userId,
    "metadata[user_id]": input.userId,
    allow_promotion_codes: "true" as unknown as undefined, // Stripe wants the literal string "true"
  });
}

/**
 * Cancels a subscription immediately (not at period end) — used when an
 * account is being deleted, so nobody keeps getting billed for a plan they
 * have no account left to manage. Best-effort by design: callers should
 * catch and log rather than let a Stripe hiccup block account deletion.
 */
export async function cancelStripeSubscription(subscriptionId: string): Promise<void> {
  await stripeRequest("DELETE", `/subscriptions/${subscriptionId}`);
}

/** Stripe Billing Portal — lets a subscribed user manage/cancel from a hosted page. */
export async function createBillingPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  return stripeRequest<{ url: string }>("POST", "/billing_portal/sessions", {
    customer: input.customerId,
    return_url: input.returnUrl,
  });
}

// --- Webhook signature verification (Stripe-Signature header) --------------
// Implements the scheme Stripe documents at
// https://docs.stripe.com/webhooks#verify-manually — HMAC-SHA256 over
// `${timestamp}.${rawBody}`, using Web Crypto so this works unmodified on
// Cloudflare Workers, Node, and in tests.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies a Stripe webhook and returns the parsed event, or throws.
 * `tolerance` matches Stripe's own default (5 minutes) to reject replays.
 */
export async function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  toleranceSeconds = 300,
): Promise<{ id: string; type: string; data: { object: Record<string, unknown> } }> {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) throw new Error("Stripe webhook secret is not configured (STRIPE_WEBHOOK_SECRET).");
  if (!signatureHeader) throw new Error("Missing Stripe-Signature header");

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );
  const timestamp = parts["t"];
  const providedSignature = parts["v1"];
  if (!timestamp || !providedSignature) throw new Error("Malformed Stripe-Signature header");

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) {
    throw new Error("Stripe webhook timestamp outside tolerance (possible replay)");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const expectedSignature = bytesToHex(signatureBytes);

  if (!timingSafeEqual(expectedSignature, providedSignature)) {
    throw new Error("Stripe webhook signature mismatch");
  }

  const event = JSON.parse(rawBody) as {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  };
  return event;
}
