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
  dailyCapResetsAt,
  dailyMessageCap,
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
  };
};

export async function getEntitlementsFor(supabase: Client, userId: string): Promise<Entitlements> {
  const today = new Date().toISOString().slice(0, 10);
  const callsSince = new Date(Date.now() - CALL_WINDOW_MS).toISOString();

  const [profileRes, rlRes, callsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("subscription_tier, stripe_billing_interval")
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
      | "monthly"
      | "yearly"
      | null
      | undefined) ?? null;

  const rl = rlRes.error ? null : rlRes.data;
  const usedToday = rl?.day_start === today ? (rl?.day_count ?? 0) : 0;

  const dailyLimit = dailyMessageCap(tier);
  const unlimited = isUnlimitedishTier(tier);

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
    },
  };
}
