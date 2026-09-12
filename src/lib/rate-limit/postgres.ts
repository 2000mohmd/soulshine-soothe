// Postgres-backed RateLimiter — the default implementation.
//
// checkAndConsume touches exactly one row (chat_rate_limits) with one read + one
// write, same as the original limiter, now covering BOTH a short sliding window
// and a daily message cap. recordUsage / getUsage use a separate chat_usage
// table so the volatile window state stays swappable to Redis later while the
// durable token/cost counter stays in Postgres.
import type { RateLimiter, RateLimitDecision, UsageRecord, UsageSummary } from "./types";
import { estimateCostUsd } from "./pricing";
import { HIGH_DAILY_MESSAGE_CAP, dailyCapResetsAt } from "../chat-limits";

const WINDOW_MS = 10 * 60 * 1000;

function envInt(key: string, fallback: number): number {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/** Sliding-window cap (messages per WINDOW_MS). */
const WINDOW_MAX = envInt("CHAT_WINDOW_MESSAGE_CAP", 20);
// The daily cap is per-tier and resolved by the caller (chat-limits.ts) — it is
// no longer a flat module constant here.

export const RATE_LIMIT_MESSAGE =
  "Let's take a short breather — we've covered a lot quickly. Try again in a few minutes and I'll be right here.";

const DAILY_LIMIT_MESSAGE =
  "You've reached your plan's message limit for today. Upgrade any time and we can pick this right back up — or I'll be right here again tomorrow.";

const today = () => new Date().toISOString().slice(0, 10);

// Deliberately loose adapter over the Supabase query builder (generic-heavy to
// type fully); this module only uses .from(...).select/.upsert.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MinimalClient = { from: (table: string) => any };

export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly supabase: MinimalClient) {}

  async checkAndConsume(
    userId: string,
    plan?: { tier: string; dailyCap: number },
  ): Promise<RateLimitDecision> {
    const now = Date.now();
    const day = today();
    // Fail open on the paywall if the caller didn't resolve a tier.
    const dailyCap = plan?.dailyCap ?? HIGH_DAILY_MESSAGE_CAP;
    const tier = plan?.tier ?? "free";

    // Try to read the daily-cap columns; if the migration that adds them has not
    // been applied yet, fall back to the legacy window-only columns so the
    // existing sliding-window limit is never silently disabled.
    let data: {
      window_start: string;
      count: number;
      day_start?: string | null;
      day_count?: number | null;
    } | null = null;
    let hasDailyCols = true;

    const full = await this.supabase
      .from("chat_rate_limits")
      .select("window_start, count, day_start, day_count")
      .eq("user_id", userId)
      .maybeSingle();
    if (full.error) {
      hasDailyCols = false;
      const legacy = await this.supabase
        .from("chat_rate_limits")
        .select("window_start, count")
        .eq("user_id", userId)
        .maybeSingle();
      // Fail OPEN — never block a conversation because the limiter itself failed.
      if (legacy.error) {
        console.error("rate limit read failed", legacy.error);
        return { allowed: true };
      }
      data = legacy.data;
    } else {
      data = full.data;
    }

    const windowStart = data ? new Date(data.window_start).getTime() : 0;
    const withinWindow = Boolean(data) && now - windowStart < WINDOW_MS;
    const windowCount = withinWindow ? (data?.count ?? 0) : 0;

    const sameDay = hasDailyCols && data?.day_start === day;
    const dayCount = sameDay ? (data?.day_count ?? 0) : 0;

    if (dayCount >= dailyCap) {
      return {
        allowed: false,
        reason: "daily",
        message: DAILY_LIMIT_MESSAGE,
        remaining: { window: Math.max(0, WINDOW_MAX - windowCount), day: 0 },
        limit: { tier, dailyLimit: dailyCap, resetsAt: dailyCapResetsAt() },
      };
    }
    if (windowCount >= WINDOW_MAX) {
      return {
        allowed: false,
        reason: "window",
        message: RATE_LIMIT_MESSAGE,
        remaining: { window: 0, day: Math.max(0, dailyCap - dayCount) },
      };
    }

    const nextWindowCount = windowCount + 1;
    const nextDayCount = dayCount + 1;
    const next: Record<string, unknown> = {
      user_id: userId,
      window_start: new Date(withinWindow ? windowStart : now).toISOString(),
      count: nextWindowCount,
    };
    if (hasDailyCols) {
      next["day_start"] = day;
      next["day_count"] = nextDayCount;
    }
    const upsert = await this.supabase
      .from("chat_rate_limits")
      .upsert(next, { onConflict: "user_id" });
    if (upsert.error) console.error("rate limit write failed", upsert.error);

    return {
      allowed: true,
      remaining: {
        window: Math.max(0, WINDOW_MAX - nextWindowCount),
        day: hasDailyCols ? Math.max(0, dailyCap - nextDayCount) : dailyCap,
      },
    };
  }

  async recordUsage(userId: string, usage: UsageRecord): Promise<void> {
    try {
      const day = today();
      const { data } = await this.supabase
        .from("chat_usage")
        .select(
          "day, day_messages, day_input_tokens, day_output_tokens, lifetime_messages, lifetime_input_tokens, lifetime_output_tokens",
        )
        .eq("user_id", userId)
        .maybeSingle();

      const sameDay = data?.day === day;
      await this.supabase.from("chat_usage").upsert(
        {
          user_id: userId,
          day,
          day_messages: (sameDay ? (data?.day_messages ?? 0) : 0) + 1,
          day_input_tokens: (sameDay ? (data?.day_input_tokens ?? 0) : 0) + usage.inputTokens,
          day_output_tokens: (sameDay ? (data?.day_output_tokens ?? 0) : 0) + usage.outputTokens,
          lifetime_messages: (data?.lifetime_messages ?? 0) + 1,
          lifetime_input_tokens: (data?.lifetime_input_tokens ?? 0) + usage.inputTokens,
          lifetime_output_tokens: (data?.lifetime_output_tokens ?? 0) + usage.outputTokens,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    } catch (err) {
      // Usage accounting must never affect the chat path.
      console.error("recordUsage failed", err, { provider: usage.provider, model: usage.model });
    }
  }

  async getUsage(userId: string): Promise<UsageSummary | null> {
    try {
      const day = today();
      const { data, error } = await this.supabase
        .from("chat_usage")
        .select(
          "day, day_messages, day_input_tokens, day_output_tokens, lifetime_messages, lifetime_input_tokens, lifetime_output_tokens",
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;

      const sameDay = data?.day === day;
      const dayInput = sameDay ? (data?.day_input_tokens ?? 0) : 0;
      const dayOutput = sameDay ? (data?.day_output_tokens ?? 0) : 0;
      const lifeInput = data?.lifetime_input_tokens ?? 0;
      const lifeOutput = data?.lifetime_output_tokens ?? 0;

      return {
        day,
        dayMessages: sameDay ? (data?.day_messages ?? 0) : 0,
        dayInputTokens: dayInput,
        dayOutputTokens: dayOutput,
        lifetimeMessages: data?.lifetime_messages ?? 0,
        lifetimeInputTokens: lifeInput,
        lifetimeOutputTokens: lifeOutput,
        estimatedDayCostUsd: estimateCostUsd("claude-sonnet-5", dayInput, dayOutput),
        estimatedLifetimeCostUsd: estimateCostUsd("claude-sonnet-5", lifeInput, lifeOutput),
      };
    } catch (err) {
      console.error("getUsage failed", err);
      return null;
    }
  }
}
