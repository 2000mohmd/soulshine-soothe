// The crisis gate: the regex triage plus the semantic backstop, together with
// everything that must happen when either flags (crisis_events row + admin
// email alert, transcript system message, thread bump).
//
// ORDERING GUARANTEE (Phase 11) — DO NOT REORDER:
// sendMessage MUST call this for every incoming message BEFORE consulting the
// per-user rate limiter. Nothing in this file reads chat_rate_limits, so a
// user who is rate-limited for ordinary chat still always receives the crisis
// response. Any refactor must preserve that property (see the automated test
// in crisis-gate.test.ts).
import type { CrisisResponse } from "./crisis";
import { buildCrisisResponse, triageCrisis } from "./crisis";
import { detectMessageScript, normalizeLanguage, type Language } from "./i18n/languages";

// Deliberate loose adapter over the Supabase query builder (generic-heavy to
// type fully); this file only chains .from(...).insert/.update/.select.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (table: string) => any };

export type CrisisGateResult = {
  crisis: CrisisResponse;
  systemMessage: { id: string; created_at: string };
  /** Whether the user message row had to be updated to flagged_crisis. */
  updatedUserMessage: boolean;
} | null;

/**
 * Only "critical" (explicit plan, method, or timeframe) interrupts the chat
 * with a system message + the crisis card. "high" and "moderate" are still
 * logged here — admins still see them in the crisis queue and get the alert
 * email — but the conversation itself continues normally rather than showing
 * the same takeover UI for passive/ambivalent language as for an active plan.
 */
async function logCrisisOnly(
  supabase: AnyClient,
  input: {
    userId: string;
    messageId: string;
    source: string;
    severity: "high" | "moderate";
    matched: string[];
    notes?: string | null;
  },
): Promise<void> {
  const { logCrisisEvent } = await import("./crisis-alert.server");
  await logCrisisEvent(supabase as never, {
    userId: input.userId,
    source: input.source,
    severity: input.severity,
    matchedTerms: input.matched,
    messageId: input.messageId,
    notes: input.notes ?? null,
  });
}

async function recordCrisis(
  supabase: AnyClient,
  input: {
    userId: string;
    threadId: string;
    messageId: string;
    source: string;
    severity: "critical" | "high" | "moderate";
    matched: string[];
    notes?: string | null;
    language?: Language;
  },
): Promise<{ id: string; created_at: string }> {
  const { logCrisisEvent } = await import("./crisis-alert.server");
  await logCrisisEvent(supabase as never, {
    userId: input.userId,
    source: input.source,
    severity: input.severity,
    matchedTerms: input.matched,
    messageId: input.messageId,
    notes: input.notes ?? null,
  });

  const saved = await supabase
    .from("chat_messages")
    .insert({
      thread_id: input.threadId,
      user_id: input.userId,
      sender: "system",
      content: buildCrisisResponse(input.matched, input.severity, input.language ?? "en").message,
      flagged_crisis: true,
    })
    .select("id, created_at")
    .single();
  if (saved.error) throw saved.error;

  await supabase
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.threadId);

  return saved.data;
}

/**
 * Runs the deterministic regex gate first; only when that is clear does it run
 * the semantic backstop (which fails open). Returns null when the message is
 * not a crisis.
 */
export async function runCrisisGate(
  supabase: AnyClient,
  input: {
    userId: string;
    threadId: string;
    messageId: string;
    content: string;
    recentTurns: { sender: string; content: string }[];
    /** The person's selected app language; drives the localized crisis copy. */
    language?: string | null;
  },
): Promise<CrisisGateResult> {
  const language = normalizeLanguage(input.language);
  const triage = triageCrisis(input.content);

  if (triage.matched.length > 0) {
    const severity = triage.severity ?? "high";
    if (severity !== "critical") {
      await logCrisisOnly(supabase, {
        userId: input.userId,
        messageId: input.messageId,
        source: "chat",
        severity,
        matched: triage.matched,
      });
      return null;
    }
    const systemMessage = await recordCrisis(supabase, {
      ...input,
      source: "chat",
      severity,
      matched: triage.matched,
      language,
    });
    return {
      crisis: buildCrisisResponse(triage.matched, severity, language),
      systemMessage,
      updatedUserMessage: false,
    };
  }

  const { classifyCrisisRisk } = await import("./crisis-classifier.server");
  const semantic = await classifyCrisisRisk(input.content, input.recentTurns);

  // FAIL-SAFE (multilingual): the regex tier covers English, Arabic and French,
  // but colloquial and code-switched phrasing outside those patterns leans on
  // the semantic net. When the classifier is unavailable AND this is not a
  // plain-English message, surface support instead of silently failing open.
  if (!semantic.flagged && semantic.failedOpen) {
    const script = detectMessageScript(input.content);
    const nonEnglish = language !== "en" || script === "arabic" || script === "other";
    if (!nonEnglish) return null;

    await supabase.from("chat_messages").update({ flagged_crisis: true }).eq("id", input.messageId);

    const systemMessage = await recordCrisis(supabase, {
      ...input,
      source: "classifier_unavailable_non_english",
      severity: "moderate",
      matched: [],
      notes: `Semantic classifier unavailable for a non-English message (language=${language}, script=${script}); failed safe.`,
      language,
    });

    return {
      crisis: buildCrisisResponse([], "moderate", language),
      systemMessage,
      updatedUserMessage: true,
    };
  }

  if (!semantic.flagged) return null;

  const severity = semantic.severity ?? "high";
  await supabase.from("chat_messages").update({ flagged_crisis: true }).eq("id", input.messageId);

  if (severity !== "critical") {
    await logCrisisOnly(supabase, {
      userId: input.userId,
      messageId: input.messageId,
      source: "semantic_classifier",
      severity,
      matched: [],
      notes: semantic.reason,
    });
    return null;
  }

  const systemMessage = await recordCrisis(supabase, {
    ...input,
    source: "semantic_classifier",
    severity,
    matched: [],
    notes: semantic.reason,
    language,
  });

  return {
    crisis: buildCrisisResponse([], severity, language),
    systemMessage,
    updatedUserMessage: true,
  };
}
