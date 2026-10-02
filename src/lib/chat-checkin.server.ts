// Proactive "haven't heard from you" chat check-in.
//
// Distinct from the existing `inactivity` nudge in nudges.server.ts, which
// looks at MOOD/HABIT logs and only fires after 4+ quiet days for someone who
// was checking in regularly (a much slower, gentler signal). This one is about
// the chat itself: if ~12 hours have passed since the person last messaged the
// companion, the companion reaches out first — a real message waiting in their
// thread, not just a dashboard card — the way the app is meant to feel always
// available, the way a person who cared would check in.
//
// Deliberately keyed off `chat_threads.updated_at` (bumped on every message,
// see chat.functions.ts) rather than `profiles.updated_at`, which is only
// touched by profile edits — someone who chats daily but never revisits
// settings would otherwise look "inactive" by that column.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateReaction } from "./companion-reaction.server";

type Client = SupabaseClient<Database>;

const QUIET_HOURS = 12;
// Once sent, don't send another for this long — keeps it to roughly once a
// day even if they still haven't replied, never a repeated ping every sweep.
const COOLDOWN_HOURS = 20;
// Bounds how far back we look for "recently active" users at all, so the scan
// stays cheap regardless of how old the table gets.
const LOOKBACK_DAYS = 14;
const SCAN_LIMIT = 300;

const MAX_UNANSWERED = 3;

function isQuietHour(timezone: string | null | undefined): boolean {
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        hour12: false,
        timeZone: timezone || "UTC",
      }).format(new Date()),
    );
    return hour >= 22 || hour < 8;
  } catch {
    return false;
  }
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

// OFF by default. This proactively messages people who haven't been in chat for
// ~12h, so — like the post-crisis follow-up (POST_CRISIS_FOLLOWUP_ENABLED) — it
// stays behind a flag until a human decides to roll it out, and is a runtime
// kill switch afterwards. Set CHAT_CHECKIN_ENABLED=true|1|yes to turn it on.
function isEnabled(): boolean {
  // ON by default — the coach reaching out is core to the product now.
  // Set CHAT_CHECKIN_ENABLED=false|0|no as a kill switch.
  const raw = (process.env["CHAT_CHECKIN_ENABLED"] ?? "").toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "no");
}

/**
 * Finds users whose most recently active chat thread has been quiet for
 * QUIET_HOURS+, generates one warm "how are you feeling" message from the
 * companion, and drops it directly into that thread — plus a `nudges` row
 * (trigger_type 'chat_checkin_12h') purely so the cooldown check has
 * somewhere to read from next sweep.
 */
export async function runChatCheckinSweep(
  supabase: Client,
  options: { batch?: number } = {},
): Promise<{ enabled: boolean; checked: number; sent: number }> {
  if (!isEnabled()) return { enabled: false, checked: 0, sent: 0 };
  const batch = options.batch ?? 25;
  const quietBefore = hoursAgoIso(QUIET_HOURS);
  const lookbackFloor = hoursAgoIso(LOOKBACK_DAYS * 24);

  // Recent threads, newest first — the first row we see for a given user_id is
  // that user's most-recently-active thread (whether or not it's quiet yet).
  const { data: rows, error } = await supabase
    .from("chat_threads")
    .select("id, user_id, updated_at")
    .gte("updated_at", lookbackFloor)
    .order("updated_at", { ascending: false })
    .limit(SCAN_LIMIT);
  if (error) throw error;

  const latestPerUser = new Map<string, { id: string; updated_at: string }>();
  for (const row of rows ?? []) {
    if (!latestPerUser.has(row.user_id)) {
      latestPerUser.set(row.user_id, { id: row.id, updated_at: row.updated_at });
    }
  }

  const candidates = [...latestPerUser.entries()]
    .filter(([, thread]) => thread.updated_at <= quietBefore)
    .slice(0, batch);

  let sent = 0;
  for (const [userId, thread] of candidates) {
    try {
      if (await sendChatCheckinIfDue(supabase, userId, thread.id)) sent += 1;
    } catch (err) {
      console.error("chat check-in failed for user", userId, err);
    }
  }

  return { enabled: true, checked: candidates.length, sent };
}

async function sendChatCheckinIfDue(
  supabase: Client,
  userId: string,
  threadId: string,
): Promise<boolean> {
  const [profile, intro, cooldown, lastUserMessage] = await Promise.all([
    supabase
      .from("profiles")
      .select("preferred_name, account_type, onboarding_completed, ai_context_consent, timezone")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_profiles").select("goals, stressors").eq("user_id", userId).maybeSingle(),
    supabase
      .from("nudges")
      .select("id")
      .eq("user_id", userId)
      .eq("trigger_type", "chat_checkin_12h")
      .gte("created_at", hoursAgoIso(COOLDOWN_HOURS))
      .limit(1)
      .maybeSingle(),
    // Only check in on someone who has actually talked to the companion
    // before — never the very first message in a brand new thread.
    supabase
      .from("chat_messages")
      .select("id")
      .eq("thread_id", threadId)
      .eq("sender", "user")
      .limit(1)
      .maybeSingle(),
  ]);

  if (!profile.data?.onboarding_completed) return false;
  if (profile.data.ai_context_consent === false) return false; // respect the opt-out entirely, not just context depth
  if (cooldown.data) return false;
  if (!lastUserMessage.data) return false;

  // Quiet hours in their own timezone — never knock overnight.
  if (isQuietHour(profile.data.timezone)) return false;

  // Stop after 3 unanswered check-ins until they come back.
  const lastUser = await supabase
    .from("chat_messages")
    .select("content, created_at")
    .eq("thread_id", threadId)
    .eq("sender", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const unanswered = await supabase
    .from("nudges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("trigger_type", "chat_checkin_12h")
    .gt("created_at", lastUser.data?.created_at ?? "1970-01-01T00:00:00Z");
  if ((unanswered.count ?? 0) >= MAX_UNANSWERED) return false;
  const lastTopic = (lastUser.data?.content ?? "").slice(0, 300);

  // ai_context_consent is confirmed not-false by the guard above.
  const message = await generateReaction(
    [
      "It's been about half a day of quiet since they last messaged you, after a real conversation.",
      "Reach out FIRST, like you would with someone you check in on — warm, low-key, genuinely curious how they're doing right now.",
      lastTopic
        ? `The last thing they said to you was: "${lastTopic}". You may gently pick that thread back up if it fits.`
        : "",
      "You are their mental-health coach. One open question about how they're feeling or how that thing went. Do not reference a 'streak', a gap, being 'away', or anything that could read as tracking them. Do not repeat anything you already said before.",
    ].join(" "),
    {
      preferredName: profile.data.preferred_name,
      accountType: profile.data.account_type,
      goals: intro.data?.goals ?? [],
      stressors: intro.data?.stressors ?? [],
    },
  );
  if (!message) return false;

  const saved = await supabase.from("chat_messages").insert({
    thread_id: threadId,
    user_id: userId,
    sender: "assistant",
    content_type: "text",
    content: message,
  });
  if (saved.error) {
    console.error("chat check-in message insert failed", saved.error);
    return false;
  }

  await supabase
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);

  const logged = await supabase.from("nudges").insert({
    user_id: userId,
    trigger_type: "chat_checkin_12h",
    message,
    suggested_exercise_slug: null,
    resource_ids: [],
  });
  if (logged.error) console.error("chat check-in nudge log failed", logged.error);

  // Best-effort — a no-op until FCM_SERVICE_ACCOUNT_JSON is configured and the
  // mobile app has registered a token; never blocks the in-app message above.
  try {
    const { sendPushToUser } = await import("./push.server");
    await sendPushToUser(supabase, userId, {
      title: profile.data.preferred_name
        ? `Kalm — thinking of you, ${profile.data.preferred_name}`
        : "Kalm",
      body: message,
    });
  } catch (err) {
    console.error("chat check-in push send failed", err);
  }

  return true;
}
