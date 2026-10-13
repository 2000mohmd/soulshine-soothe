// The rate-limiting seam. Call sites depend on this interface only; the
// implementation (Postgres today) is selected in index.ts, so a Redis-backed
// limiter can replace it later without touching sendMessage.
//
// The crisis-detection gate is NEVER rate-limited — it runs earlier in
// sendMessage, before any limiter is consulted (see crisis-gate.server.ts).

// "intro": a free member has used their first conversation (chat.functions.ts).
export type RateLimitReason = "window" | "daily" | "intro";

export type RateLimitDecision = {
  allowed: boolean;
  /** Set when allowed === false: which limit tripped. */
  reason?: RateLimitReason;
  /** User-facing copy for the tripped limit. */
  message?: string;
  /** Best-effort remaining allowance, for UI / response headers. */
  remaining?: { window: number; day: number };
  /**
   * Set when reason === "daily": everything the client needs to render an
   * upgrade prompt without a second call to /api/v1/entitlements.
   */
  limit?: { tier: string; dailyLimit: number; resetsAt: string };
};

export type UsageRecord = {
  inputTokens: number;
  outputTokens: number;
  /** Provider that actually served the call ("openrouter" | "lovable"). */
  provider: string;
  /** App-level model id, e.g. "claude-sonnet-5". */
  model: string;
};

export type UsageSummary = {
  day: string; // YYYY-MM-DD (UTC)
  dayMessages: number;
  dayInputTokens: number;
  dayOutputTokens: number;
  lifetimeMessages: number;
  lifetimeInputTokens: number;
  lifetimeOutputTokens: number;
  /** Rough $ estimate from PRICING; not a billing figure. */
  estimatedDayCostUsd: number;
  estimatedLifetimeCostUsd: number;
};

export interface RateLimiter {
  /**
   * Call once per inbound chat message on the normal path. Records the attempt
   * when it is allowed. Must never throw and must fail OPEN (allow) if its own
   * storage is unavailable — a broken limiter must not break chat.
   *
   * `plan` carries the caller-resolved tier + the daily cap for that tier (from
   * chat-limits.ts). Omitting it falls back to the high cap, so a path that
   * forgets to pass it fails open on the paywall rather than wrongly throttling.
   */
  checkAndConsume(
    userId: string,
    plan?: { tier: string; dailyCap: number },
  ): Promise<RateLimitDecision>;

  /**
   * Record token usage for a completed model exchange (which may span several
   * provider calls). Safe to call fire-and-forget; never throws.
   */
  recordUsage(userId: string, usage: UsageRecord): Promise<void>;

  /** Read the visible per-user usage counter. Returns null on error. */
  getUsage(userId: string): Promise<UsageSummary | null>;
}
