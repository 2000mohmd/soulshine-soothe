// Single source of truth for the per-user daily message cap and the weekly
// voice-call allowance.
//
// The enforcer (rate-limit/postgres.ts) and the reporter
// (entitlements.server.ts / GET /api/v1/entitlements) BOTH derive the number
// from `dailyMessageCap(tier)` here — so the limit we advertise is exactly the
// limit we enforce.
//
// Tiers: free | pro | premium | org
//   free    —  8 messages/day, no voice calls
//   pro     — 200 messages/day, 1 voice call per rolling 7 days
//   premium — 500 messages/day (marketed as "unlimited" — it's an abuse guard,
//             not a literal infinity), 2 voice calls per rolling 7 days
//   org     — same allowances as premium

export type ChatTier = "free" | "pro" | "premium" | "org";

function envInt(key: string, fallback: number): number {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/** Free tier: 8 messages/day by default. Tune with FREE_DAILY_MESSAGE_CAP. */
export const FREE_DAILY_MESSAGE_CAP = envInt(
  "FREE_DAILY_MESSAGE_CAP",
  // Legacy name, still honoured so an existing deployment env doesn't silently change.
  envInt("FREE_DAILY_CHAT_CREDITS", 8),
);

/** Pro: the original high cap. Tune with CHAT_DAILY_MESSAGE_CAP. */
export const HIGH_DAILY_MESSAGE_CAP = envInt("CHAT_DAILY_MESSAGE_CAP", 200);

/** Premium / org: the "unlimited" ceiling. Tune with PREMIUM_DAILY_MESSAGE_CAP. */
export const PREMIUM_DAILY_MESSAGE_CAP = envInt("PREMIUM_DAILY_MESSAGE_CAP", 500);

/** pro/premium/org are paid tiers (treated as effectively uncapped for UX copy). */
export function isUnlimitedishTier(tier: string | null | undefined): boolean {
  return tier === "pro" || tier === "premium" || tier === "org";
}

/** The daily message cap that actually applies to this user's tier. */
export function dailyMessageCap(tier: string | null | undefined): number {
  if (tier === "premium" || tier === "org") return PREMIUM_DAILY_MESSAGE_CAP;
  if (tier === "pro") return HIGH_DAILY_MESSAGE_CAP;
  return FREE_DAILY_MESSAGE_CAP;
}

// --- Voice calls ------------------------------------------------------------

/** Rolling window the call allowance is counted over. */
export const CALL_WINDOW_DAYS = 7;
export const CALL_WINDOW_MS = CALL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Live voice calls allowed per rolling 7 days for this tier (0 = no access). */
export function weeklyCallAllowance(tier: string | null | undefined): number {
  if (tier === "premium" || tier === "org") return 2;
  if (tier === "pro") return 1;
  return 0;
}

/** ISO timestamp of the next UTC midnight — when the daily cap resets. */
export function dailyCapResetsAt(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0),
  ).toISOString();
}
