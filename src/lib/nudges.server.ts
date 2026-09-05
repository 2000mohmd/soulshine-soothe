// Proactive coaching engine: evaluates recent data and creates at most one
// nudge per trigger type, with a cooldown so nudges never repeat blindly.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { severityIndex } from "./screeners";
import { generateNudgeMessage, type CompanionContext } from "./ai-companion.server";

type Client = SupabaseClient<Database>;

export const NUDGE_COOLDOWN_DAYS = 7;
const LOW_MOOD_STREAK_DAYS = 5;
const INACTIVITY_DAYS = 4;
// A pending commitment with no explicit due date is treated as "worth a gentle
// mention" once it's been sitting this long.
const COMMITMENT_STALE_DAYS = 2;

type TriggerType = Database["public"]["Tables"]["nudges"]["Row"]["trigger_type"];

type Candidate = {
  trigger_type: TriggerType;
  instruction: string;
  suggested_exercise_slug: string | null;
  stepUp: boolean;
};

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export async function evaluateNudgesFor(supabase: Client, userId: string) {
  const [moods, habitLogs, screeners, recentNudges, profile, intro, commitments] =
    await Promise.all([
      supabase
        .from("mood_logs")
        .select("score, note, tags, logged_at")
        .eq("user_id", userId)
        .gte("logged_at", daysAgo(30).toISOString())
        .order("logged_at", { ascending: false }),
      supabase
        .from("habit_logs")
        .select("log_date, completed")
        .eq("user_id", userId)
        .gte("log_date", isoDay(daysAgo(30)))
        .order("log_date", { ascending: false }),
      supabase
        .from("screener_responses")
        .select("screener_type, total_score, severity, taken_at")
        .eq("user_id", userId)
        .order("taken_at", { ascending: false })
        .limit(10),
      supabase
        .from("nudges")
        .select("trigger_type, created_at")
        .eq("user_id", userId)
        .gte("created_at", daysAgo(NUDGE_COOLDOWN_DAYS).toISOString()),
      supabase
        .from("profiles")
        .select("preferred_name, account_type, ai_context_consent, language")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("user_profiles")
        .select(
          "intro_text, care_plan, goals, stressors, communication_preference, topics_to_avoid, in_professional_care",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("commitments")
        .select("description, due_at, created_at")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
    ]);

  const moodRows = moods.data ?? [];
  const onCooldown = new Set((recentNudges.data ?? []).map((row) => row.trigger_type));
  const candidates: Candidate[] = [];

  // --- 1. Sustained low mood: 5+ consecutive days averaging below 3/5 ---
  const byDay = new Map<string, number[]>();
  for (const row of moodRows) {
    const day = isoDay(new Date(row.logged_at));
    byDay.set(day, [...(byDay.get(day) ?? []), row.score]);
  }
  let streak = 0;
  for (let offset = 0; offset < 14; offset += 1) {
    const day = isoDay(daysAgo(offset));
    const scores = byDay.get(day);
    if (!scores || scores.length === 0) break;
    const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    if (average >= 3) break;
    streak += 1;
  }
  if (streak >= LOW_MOOD_STREAK_DAYS) {
    candidates.push({
      trigger_type: "low_mood_streak",
      instruction: `Their mood check-ins have sat below the middle of the scale for ${streak} days in a row. Acknowledge that this stretch sounds heavy without dramatising it, and invite them — softly, as an option — to try a short Behavioral Activation exercise: naming one very small, concrete thing they could do in the next day. Do not promise it will fix anything.`,
      suggested_exercise_slug: "behavioral-activation",
      stepUp: false,
    });
  }

  // --- 2. Gone quiet after regular use ---
  const lastMood = moodRows[0]?.logged_at ? new Date(moodRows[0].logged_at) : null;
  const lastHabit = habitLogs.data?.[0]?.log_date
    ? new Date(`${habitLogs.data[0].log_date}T12:00:00Z`)
    : null;
  const lastActivity = [lastMood, lastHabit]
    .filter((value): value is Date => value !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const totalActivity = moodRows.length + (habitLogs.data?.length ?? 0);
  if (
    lastActivity &&
    totalActivity >= 4 &&
    (Date.now() - lastActivity.getTime()) / 86400000 >= INACTIVITY_DAYS
  ) {
    candidates.push({
      trigger_type: "inactivity",
      instruction:
        "They were checking in regularly and then stopped for several days. Write a low-pressure 'haven't heard from you' message framed entirely as care and curiosity — never as a missed streak, a lapse, or something to catch up on. Make clear there is no expectation and the door is simply open.",
      suggested_exercise_slug: null,
      stepUp: false,
    });
  }

  // --- 3. Screener step-up: moderate or higher, or worsening by 2+ bands ---
  const screenerRows = screeners.data ?? [];
  let stepUpReason: string | null = null;
  for (const type of ["phq9", "gad7"] as const) {
    const forType = screenerRows.filter((row) => row.screener_type === type);
    const latest = forType[0];
    const previous = forType[1];
    if (!latest) continue;
    const latestBand = severityIndex(latest.severity);
    const worsened = previous ? latestBand - severityIndex(previous.severity) >= 2 : false;
    if (latestBand >= 2 || worsened) {
      stepUpReason = worsened
        ? `Their most recent ${type === "phq9" ? "low-mood" : "anxiety"} check-in moved noticeably in the harder direction compared with the one before it.`
        : `Their most recent ${type === "phq9" ? "low-mood" : "anxiety"} check-in sits in a moderate or higher range.`;
      break;
    }
  }
  if (stepUpReason) {
    candidates.push({
      trigger_type: "screener_step_up",
      instruction: `${stepUpReason} They are NOT in acute crisis — this is the plateaued-or-declining middle zone. Write a warm, non-alarming step-up message along the lines of "I've noticed things have felt heavy for a while — this might be a good moment to talk to someone who can offer more support than I can." Be honest about your own limits without withdrawing, make it clear this is not a diagnosis and not something they've done wrong, and mention that a few options are shown alongside your message.`,
      suggested_exercise_slug: null,
      stepUp: true,
    });
  }

  // --- 4. Commitment follow-up: a due / overdue thing they said they'd try,
  // never revisited. Surfaces the OLDEST still-pending one. Same 7-day cooldown
  // as every other trigger (via `onCooldown`). ---
  const pendingCommitments = commitments.data ?? [];
  const oldestCommitment = pendingCommitments[0];
  if (oldestCommitment) {
    const dueAt = oldestCommitment.due_at ? new Date(oldestCommitment.due_at) : null;
    const ageDays = (Date.now() - new Date(oldestCommitment.created_at).getTime()) / 86_400_000;
    const overdue = dueAt ? dueAt.getTime() <= Date.now() : false;
    const stale = !dueAt && ageDays >= COMMITMENT_STALE_DAYS;
    if (overdue || stale) {
      candidates.push({
        trigger_type: "commitment_follow_up",
        instruction: `A little while ago they said they would try: "${oldestCommitment.description}". It hasn't come up since. Bring it up the way a friend who genuinely remembered would — warm, light, curious, with no pressure and no scorekeeping. If it sounds like it didn't happen, be curious about what got in the way, never disappointed; an intention that slipped is information, not a failure. Make it easy for them to say it's done, not yet, or that they'd rather let it go. Do NOT call it a "commitment", "task" or "goal", and never use streak or accountability language.`,
        suggested_exercise_slug: null,
        stepUp: false,
      });
    }
  }

  const pending = candidates.filter((candidate) => !onCooldown.has(candidate.trigger_type));
  if (pending.length === 0) return { created: 0 };

  const consented = profile.data?.ai_context_consent !== false;
  const baseContext: CompanionContext = {
    preferredName: profile.data?.preferred_name ?? null,
    accountType: profile.data?.account_type ?? null,
    introText: consented ? (intro.data?.intro_text ?? null) : null,
    carePlan: consented ? (intro.data?.care_plan ?? null) : null,
    goals: consented ? (intro.data?.goals ?? []) : [],
    stressors: consented ? (intro.data?.stressors ?? []) : [],
    communicationPreference: intro.data?.communication_preference ?? null,
    topicsToAvoid: intro.data?.topics_to_avoid ?? null,
    inProfessionalCare: intro.data?.in_professional_care ?? false,
    recentMoods: consented ? moodRows.slice(0, 7) : [],
    history: [],
    openCommitments: pendingCommitments.map((row) => ({
      description: row.description,
      ageDays: (Date.now() - new Date(row.created_at).getTime()) / 86_400_000,
    })),
    quickAction: null,
  };

  // Step-up pathway resources: a small, relevant set — never a wall of links.
  // Region-filtered by the person's language (see care-region.ts).
  const resources = await supabase
    .from("care_resources")
    .select("id, resource_type, region")
    .eq("is_active", true)
    .in("resource_type", ["directory", "low_cost", "crisis"])
    .order("sort_order", { ascending: true });
  const { filterResourcesByRegion } = await import("./care-region");
  const regionResources = filterResourcesByRegion(
    resources.data ?? [],
    profile.data?.language ?? null,
  );
  const stepUpResourceIds = ["directory", "low_cost", "crisis"]
    .map((type) => regionResources.find((row) => row.resource_type === type)?.id)
    .filter((id): id is string => Boolean(id));

  let created = 0;
  for (const candidate of pending) {
    let message: string;
    try {
      message = await generateNudgeMessage(baseContext, candidate.instruction, {
        supabase,
        userId,
        threadId: null,
      });
    } catch (error) {
      console.error("nudge generation failed", candidate.trigger_type, error);
      continue;
    }
    const insert = await supabase.from("nudges").insert({
      user_id: userId,
      trigger_type: candidate.trigger_type,
      message,
      suggested_exercise_slug: candidate.suggested_exercise_slug,
      resource_ids: candidate.stepUp ? stepUpResourceIds : [],
    });
    if (insert.error) {
      console.error("nudge insert failed", insert.error);
      continue;
    }
    created += 1;
  }

  return { created };
}
