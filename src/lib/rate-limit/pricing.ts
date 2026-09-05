// Rough per-million-token prices for a $ estimate on the usage counter. NOT a
// billing source of truth — update when provider pricing changes, and treat the
// output as indicative only. Unknown models fall back to the Sonnet rate.
import type { UsageRecord } from "./types";

type Price = { inPerM: number; outPerM: number };

const FALLBACK: Price = { inPerM: 3, outPerM: 15 }; // Sonnet-class rate

const PRICING: Record<string, Price> = {
  "claude-sonnet-5": FALLBACK,
  "claude-sonnet-4-5": FALLBACK,
  "claude-haiku-4-5": { inPerM: 1, outPerM: 5 },
  "google/gemini-3.6-flash": { inPerM: 0.3, outPerM: 2.5 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICING[model] ?? FALLBACK;
  return (inputTokens / 1_000_000) * price.inPerM + (outputTokens / 1_000_000) * price.outPerM;
}

export function estimateRecordCostUsd(usage: UsageRecord): number {
  return estimateCostUsd(usage.model, usage.inputTokens, usage.outputTokens);
}

// --- Live voice calls -------------------------------------------------------
// OpenAI Realtime bills audio tokens in and out. When the Realtime API reports
// token counts we price them directly; otherwise we fall back to a blended
// per-minute rate, which is what call_sessions.estimated_cost_usd stores today.
// Indicative only — same caveat as above.

const REALTIME_AUDIO_IN_PER_M = 32;
const REALTIME_AUDIO_OUT_PER_M = 64;
/** Blended estimate when only duration is known. Tune with VOICE_COST_PER_MINUTE_USD. */
const VOICE_PER_MINUTE_FALLBACK = 0.5;

function voicePerMinute(): number {
  const raw = Number(process.env["VOICE_COST_PER_MINUTE_USD"]);
  return Number.isFinite(raw) && raw > 0 ? raw : VOICE_PER_MINUTE_FALLBACK;
}

export function estimateCallCostUsd(
  durationSeconds: number,
  inputTokens = 0,
  outputTokens = 0,
): number {
  if (inputTokens > 0 || outputTokens > 0) {
    return (
      (inputTokens / 1_000_000) * REALTIME_AUDIO_IN_PER_M +
      (outputTokens / 1_000_000) * REALTIME_AUDIO_OUT_PER_M
    );
  }
  return (Math.max(0, durationSeconds) / 60) * voicePerMinute();
}
