// What a given user is currently allowed to do. The mobile client reads this to
// gate the chat composer, show an upgrade prompt, unlock premium features, etc.
//
// The daily message cap (`dailyLimit`) comes from chat-limits.ts —
// `dailyMessageCap(tier)` — which is the SAME function the rate limiter enforces
// with, so what we advertise here cannot drift from what we enforce. `usedToday`
// is read from chat_rate_limits.day_count (the counter the limiter actually
// checks), not chat_usage, so `remainingToday` matches enforcement exactly.
//
// Voice numbers come from the same helpers call-session.server.ts enforces with:
// weeklyCallAllowance(tier) plus a count of calls in the rolling 7-day window.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  CALL_WINDOW_DAYS,
  CALL_WINDOW_MS,
  FREE_INTRO_MESSAGE_CAP,
  TRIAL_DAYS,
  dailyCapResetsAt,
  dailyMessageCap,
  humanCoachAllowed,
  isUnlimitedishTier,
  weeklyCallAllowance,
} from "./chat-limits";

type Client = SupabaseClient<Database>;

export type SubscriptionTier = "free" | "pro" | "premium" | "org";

export type Entitlements = {
  tier: SubscriptionTier;
  billingInterval: "monthly" | "yearly" | null;
  chat: {
    unlimited: boolean; // pro/premium/org — effectively uncapped for UX
    dailyLimit: number; // the real per-tier daily cap, always present
    dailyCredits: number | null; // free tier only (== dailyLimit); null when unlimited
    usedToday: number;
    remainingToday: number | null; // null when unlimited
    resetsAt: string; // ISO — next UTC midnight
    /** Free tier only: their one first conversation. null on paid tiers. */
    intro: { limit: number; used: number; remaining: number } | null;
  };
  trial: {
    active: boolean; // on the free trial right now
    endsAt: string | null; // ISO — when billing starts, while active
    eligible: boolean; // checkout would start with a free trial (never subscribed)
    days: number;
  };
  voice: {
    enabled: boolean;
    weeklyLimit: number;
    usedThisWeek: number;
    remainingThisWeek: number;
    windowDays: number;
    nextCallAvailableAt: string | null; // ISO, only when out of calls
    maxCallMinutes: number;
  };
  features: {
    unlimitedHistory: boolean;
    liveSessions: boolean;
    dataExport: boolean;
    /** May open a NEW human-coach request (paid, and past the trial). */
    humanCoach: boolean;
  };
};

export async function getEntitlementsFor(supabase: Client, userId: string): Promise<Entitlements> {
  const today = new Date().toISOString().slice(0, 10);
  const callsSince = new Date(Date.now() - CALL_WINDOW_MS).toISOString();

  const [profileRes, rlRes, callsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "subscription_tier, stripe_billing_interval, stripe_subscription_status, subscription_current_period_end",
      )
      .eq("id", userId)
      .maybeSingle(),
    // day_count is the counter the limiter enforces on. If the daily-cap columns
    // aren't present yet, this errors and we treat usage as 0.
    supabase
      .from("chat_rate_limits")
      .select("day_start, day_count")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("call_sessions")
      .select("started_at")
      .eq("user_id", userId)
      .neq("status", "failed")
      .gte("started_at", callsSince)
      .order("started_at", { ascending: true }),
  ]);

  const tier = ((profileRes.data?.subscription_tier as SubscriptionTier | null) ??
    "free") as SubscriptionTier;
  const billingInterval =
    (profileRes.data?.["stripe_billing_interval" as keyof typeof profileRes.data] as
      "monthly" | "yearly" | null | undefined) ?? null;

  const rl = rlRes.error ? null : rlRes.data;
  const usedToday = rl?.day_start === today ? (rl?.day_count ?? 0) : 0;

  const dailyLimit = dailyMessageCap(tier);
  const unlimited = isUnlimitedishTier(tier);
  const status = profileRes.data?.stripe_subscription_status ?? null;
  const trialing = status === "trialing";

  let intro: Entitlements["chat"]["intro"] = null;
  if (!unlimited) {
    const { count } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("sender", "user");
    const used = Math.min(count ?? 0, FREE_INTRO_MESSAGE_CAP);
    intro = { limit: FREE_INTRO_MESSAGE_CAP, used, remaining: FREE_INTRO_MESSAGE_CAP - used };
  }

  const weeklyLimit = weeklyCallAllowance(tier);
  const calls = callsRes.error ? [] : (callsRes.data ?? []);
  const usedThisWeek = calls.length;
  const remainingThisWeek = Math.max(0, weeklyLimit - usedThisWeek);
  const oldest = calls[0]?.started_at ?? null;
  const nextCallAvailableAt =
    weeklyLimit === 0 || remainingThisWeek > 0 || !oldest
      ? null
      : new Date(new Date(oldest).getTime() + CALL_WINDOW_MS).toISOString();

  return {
    tier,
    billingInterval,
    chat: {
      unlimited,
      dailyLimit,
      dailyCredits: unlimited ? null : dailyLimit,
      usedToday,
      remainingToday: unlimited ? null : Math.max(0, dailyLimit - usedToday),
      resetsAt: dailyCapResetsAt(),
      intro,
    },
    trial: {
      active: trialing,
      endsAt: trialing ? (profileRes.data?.subscription_current_period_end ?? null) : null,
      eligible: !status,
      days: TRIAL_DAYS,
    },
    voice: {
      enabled: weeklyLimit > 0,
      weeklyLimit,
      usedThisWeek,
      remainingThisWeek,
      windowDays: CALL_WINDOW_DAYS,
      nextCallAvailableAt,
      maxCallMinutes: 30,
    },
    features: {
      unlimitedHistory: unlimited,
      liveSessions: weeklyLimit > 0,
      dataExport: unlimited,
      humanCoach: humanCoachAllowed(tier, status),
    },
  };
}
