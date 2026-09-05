// Live voice call sessions ("call as a session").
//
// Transport: OpenAI Realtime (WebRTC). OpenRouter has no realtime audio API, so
// chat + voice notes stay on OpenRouter while the live call runs on OpenAI.
// The client never sees OPENAI_API_KEY: we mint a short-lived ephemeral client
// secret server-side and hand that over.
//
// SAFETY: every user turn the client reports goes through the SAME crisis gate
// as chat (runCrisisGate) BEFORE anything else. When it flags, the caller must
// end the call and surface the crisis response — the gate has already written
// the crisis_events row, the transcript system message and the admin alert.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildSystemPrompt, type CompanionContext } from "./ai-companion.server";
import { runCrisisGate } from "./crisis-gate.server";
import type { CrisisResponse } from "./crisis";
import { callCompanionModel } from "./llm-provider.server";
import { CALL_WINDOW_DAYS, CALL_WINDOW_MS, weeklyCallAllowance } from "./chat-limits";
import { estimateCallCostUsd } from "./rate-limit/pricing";
import { fetchRecentSummaries } from "./thread-summary.server";

type Client = SupabaseClient<Database>;

const REALTIME_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
const REALTIME_MODEL = "gpt-realtime";
const DEFAULT_VOICE = "cedar";
const WEBRTC_URL = "https://api.openai.com/v1/realtime/calls";
/** A single call can't run forever — the client should hang up at this point. */
const MAX_CALL_SECONDS = 30 * 60;
const SUMMARY_MODEL = "claude-haiku-4-5";

export class CallSessionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type CallTurn = { role: "user" | "assistant"; text: string; at: string };

export type CallSessionRow = Database["public"]["Tables"]["call_sessions"]["Row"];

/**
 * Voice-call access + frequency. Free has no access at all; Pro gets one call
 * per rolling 7 days and Premium/org get two. The window is counted straight off
 * call_sessions (any call that actually started — failed provider handshakes
 * don't count), modelled on the sliding window in rate-limit/postgres.ts.
 */
async function assertLiveSessionsAllowed(supabase: Client, userId: string): Promise<void> {
  if (process.env["LIVE_SESSIONS_OPEN_BETA"] === "true") return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .maybeSingle();

  const allowance = weeklyCallAllowance(profile?.subscription_tier);
  if (allowance === 0) {
    throw new CallSessionError(
      "Live voice sessions are part of the Pro and Premium plans.",
      402,
    );
  }

  const usage = await callWindowUsage(supabase, userId, allowance);
  if (usage.remaining <= 0) {
    const when = usage.nextAvailableAt
      ? new Date(usage.nextAvailableAt).toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        })
      : "soon";
    throw new CallSessionError(
      `You've used your ${allowance === 1 ? "voice call" : `${allowance} voice calls`} for this week. Your next call is available on ${when}. I'm still here in chat any time.`,
      429,
    );
  }
}

/** How many calls this user has started in the rolling window, and when the next one frees up. */
export async function callWindowUsage(
  supabase: Client,
  userId: string,
  allowance: number,
): Promise<{
  allowance: number;
  used: number;
  remaining: number;
  windowDays: number;
  nextAvailableAt: string | null;
}> {
  const since = new Date(Date.now() - CALL_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from("call_sessions")
    .select("started_at")
    .eq("user_id", userId)
    .neq("status", "failed")
    .gte("started_at", since)
    .order("started_at", { ascending: true });

  const started = data ?? [];
  const used = started.length;
  const remaining = Math.max(0, allowance - used);
  // The oldest call inside the window is the one that ages out first.
  const oldest = started[0]?.started_at ?? null;
  const nextAvailableAt =
    remaining > 0 || !oldest
      ? null
      : new Date(new Date(oldest).getTime() + CALL_WINDOW_MS).toISOString();

  return { allowance, used, remaining, windowDays: CALL_WINDOW_DAYS, nextAvailableAt };
}

async function loadCallContext(
  supabase: Client,
  userId: string,
  threadId: string,
): Promise<CompanionContext> {
  const [profile, userProfile, moods, summaries] = await Promise.all([
    supabase
      .from("profiles")
      .select("preferred_name, account_type")
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
      .from("mood_logs")
      .select("score, note, tags, logged_at")
      .eq("user_id", userId)
      .order("logged_at", { ascending: false })
      .limit(5),
    fetchRecentSummaries(supabase, userId, threadId, 2).catch(() => []),
  ]);

  const up = userProfile.data;
  return {
    preferredName: profile.data?.preferred_name ?? null,
    accountType: profile.data?.account_type ?? null,
    introText: up?.intro_text ?? null,
    carePlan: up?.care_plan ?? null,
    goals: up?.goals ?? [],
    stressors: up?.stressors ?? [],
    communicationPreference: up?.communication_preference ?? null,
    topicsToAvoid: up?.topics_to_avoid ?? null,
    inProfessionalCare: up?.in_professional_care ?? false,
    recentMoods: (moods.data ?? []).map((m) => ({
      score: m.score,
      note: m.note,
      tags: m.tags ?? [],
      logged_at: m.logged_at,
    })),
    history: [],
    quickAction: null,
    pastSummaries: (summaries as { summary: string; when: string; commitmentNote: string | null }[])
      .slice(0, 2),
  };
}

const VOICE_ADDENDUM = [
  "",
  "THIS IS A LIVE SPOKEN CALL, not text chat.",
  "- Speak in short, natural spoken sentences (1-3 at a time). No lists, no markdown, no headings.",
  "- Leave room for the person to interrupt you; stop talking as soon as they start.",
  "- Never read out URLs or phone numbers unless the person asks for them.",
  "- If the person sounds unsafe or mentions self-harm, stay calm, stay with them, and encourage immediate human help.",
].join("\n");

/**
 * Start a call: create (or reuse) a chat thread, insert the call_sessions row and
 * mint an ephemeral OpenAI Realtime client secret carrying Kalm's instructions.
 */
export async function startCallSessionCore(
  supabase: Client,
  userId: string,
  input: { thread_id?: string | null; voice?: string | null } = {},
) {
  await assertLiveSessionsAllowed(supabase, userId);

  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new CallSessionError("Live voice sessions aren't configured yet.", 503);

  // One active call at a time.
  const { data: active } = await supabase
    .from("call_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  if (active && active.length > 0) {
    throw new CallSessionError("A call session is already active. End it before starting another.", 409);
  }

  let threadId = input.thread_id ?? null;
  if (threadId) {
    const owned = await supabase
      .from("chat_threads")
      .select("id")
      .eq("id", threadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!owned.data) throw new CallSessionError("Thread not found", 404);
  } else {
    const created = await supabase
      .from("chat_threads")
      .insert({ user_id: userId, title: "Voice session" })
      .select("id")
      .single();
    if (created.error) throw created.error;
    threadId = created.data.id;
  }

  const voice = input.voice?.trim() || DEFAULT_VOICE;
  const instructions = buildSystemPrompt(await loadCallContext(supabase, userId, threadId)) + VOICE_ADDENDUM;

  const session = await supabase
    .from("call_sessions")
    .insert({
      user_id: userId,
      thread_id: threadId,
      provider: "openai_realtime",
      model: REALTIME_MODEL,
      voice,
      status: "active",
    })
    .select("*")
    .single();
  if (session.error) throw session.error;

  let secret: { value: string; expires_at: number | null };
  try {
    secret = await mintRealtimeSecret(apiKey, { instructions, voice });
  } catch (err) {
    await supabase
      .from("call_sessions")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
        end_reason: "provider_error",
      })
      .eq("id", session.data.id);
    throw err;
  }

  return {
    session: session.data,
    realtime: {
      provider: "openai_realtime",
      model: REALTIME_MODEL,
      voice,
      client_secret: secret.value,
      expires_at: secret.expires_at,
      webrtc_url: WEBRTC_URL,
      max_duration_seconds: MAX_CALL_SECONDS,
    },
  };
}

async function mintRealtimeSecret(
  apiKey: string,
  opts: { instructions: string; voice: string },
): Promise<{ value: string; expires_at: number | null }> {
  const response = await fetch(REALTIME_SECRETS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions: opts.instructions,
        audio: {
          input: { transcription: { model: "gpt-4o-mini-transcribe" } },
          output: { voice: opts.voice },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("[calls] realtime secret failed", response.status, body.slice(0, 300));
    throw new CallSessionError(
      response.status === 401
        ? "The voice provider rejected the configured key."
        : response.status === 429 || response.status === 402
          ? "The voice provider is out of capacity or credits right now."
          : "Couldn't start the voice session. Please try again.",
      502,
    );
  }

  const payload = (await response.json()) as {
    value?: string;
    client_secret?: { value?: string; expires_at?: number };
    expires_at?: number;
  };
  const value = payload.value ?? payload.client_secret?.value;
  if (!value) throw new CallSessionError("The voice provider returned no session token.", 502);
  return { value, expires_at: payload.expires_at ?? payload.client_secret?.expires_at ?? null };
}

async function loadOwnedSession(
  supabase: Client,
  userId: string,
  sessionId: string,
): Promise<CallSessionRow> {
  const { data } = await supabase
    .from("call_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new CallSessionError("Call session not found", 404);
  return data;
}

/**
 * Record one spoken turn. User turns run the crisis gate FIRST (same gate as
 * chat). When it flags, the session is marked and the caller must end the call.
 */
export async function appendCallTurnCore(
  supabase: Client,
  userId: string,
  input: { session_id: string; role: "user" | "assistant"; text: string },
): Promise<{ turn_count: number; crisis: CrisisResponse | null }> {
  const text = input.text.trim();
  if (!text) throw new CallSessionError("Empty turn");

  const session = await loadOwnedSession(supabase, userId, input.session_id);
  if (session.status !== "active") throw new CallSessionError("This call session has ended.", 409);

  const transcript = ((session.transcript as CallTurn[] | null) ?? []).slice();
  let crisis: CrisisResponse | null = null;

  if (input.role === "user" && session.thread_id) {
    // Persist the spoken turn as a chat message so the crisis gate (and later
    // review) has a real message row to attach to.
    const message = await supabase
      .from("chat_messages")
      .insert({
        thread_id: session.thread_id,
        user_id: userId,
        sender: "user",
        content: text,
        content_type: "voice_call",
      })
      .select("id")
      .single();
    if (message.error) throw message.error;

    const { data: profile } = await supabase
      .from("profiles")
      .select("language")
      .eq("id", userId)
      .maybeSingle();

    const gate = await runCrisisGate(supabase, {
      userId,
      threadId: session.thread_id,
      messageId: message.data.id,
      content: text,
      recentTurns: transcript.slice(-6).map((t) => ({ sender: t.role, content: t.text })),
      language: profile?.language ?? null,
    });
    if (gate) crisis = gate.crisis;
  }

  transcript.push({ role: input.role, text, at: new Date().toISOString() });

  const update = await supabase
    .from("call_sessions")
    .update({
      transcript,
      turn_count: transcript.length,
      ...(crisis
        ? { crisis_triggered: true, crisis_severity: crisis.severity }
        : {}),
    })
    .eq("id", session.id)
    .select("turn_count")
    .single();
  if (update.error) throw update.error;

  return { turn_count: update.data.turn_count, crisis };
}

/** End the call, compute duration, and write a short summary into the thread. */
export async function endCallSessionCore(
  supabase: Client,
  userId: string,
  input: { session_id: string; end_reason?: string | null },
) {
  const session = await loadOwnedSession(supabase, userId, input.session_id);
  const endedAt = new Date();
  const durationSeconds = Math.max(
    0,
    Math.round((endedAt.getTime() - new Date(session.started_at).getTime()) / 1000),
  );

  const transcript = (session.transcript as CallTurn[] | null) ?? [];
  const summary = transcript.length >= 2 ? await summarizeCall(transcript) : null;

  if (summary && session.thread_id) {
    await supabase.from("chat_messages").insert({
      thread_id: session.thread_id,
      user_id: userId,
      sender: "system",
      content: `Voice session (${Math.round(durationSeconds / 60)} min): ${summary}`,
      content_type: "call_summary",
    });
    await supabase
      .from("chat_threads")
      .update({ updated_at: endedAt.toISOString() })
      .eq("id", session.thread_id);
  }

  const update = await supabase
    .from("call_sessions")
    .update({
      status: session.status === "failed" ? "failed" : "ended",
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
      // Internal cost accounting — the same idea as chat's chat_usage rows, so
      // per-customer cost vs. price is visible in the admin cost view.
      estimated_cost_usd: estimateCallCostUsd(durationSeconds),
      summary,
      end_reason: input.end_reason ?? "client_hangup",
    })
    .eq("id", session.id)
    .select("*")
    .single();
  if (update.error) throw update.error;

  return update.data;
}

async function summarizeCall(transcript: CallTurn[]): Promise<string | null> {
  const text = transcript
    .slice(-40)
    .map((t) => `${t.role === "user" ? "Person" : "Kalm"}: ${t.text}`)
    .join("\n");
  try {
    const reply = await callCompanionModel({
      model: SUMMARY_MODEL,
      maxTokens: 300,
      system:
        "Summarize this spoken wellness session in 2-4 warm, plain sentences for the person's own records. Mention what they were working through and anything they said they'd try. No advice, no diagnosis, no lists.",
      messages: [{ role: "user", content: text }],
    });
    const out = reply.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    return out || null;
  } catch (err) {
    console.error("[calls] summary failed", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function listCallSessionsCore(supabase: Client, userId: string, limit = 20) {
  const { data, error } = await supabase
    .from("call_sessions")
    .select(
      "id, thread_id, status, provider, model, voice, started_at, ended_at, duration_seconds, turn_count, summary, crisis_triggered, crisis_severity, end_reason",
    )
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) throw error;
  return { sessions: data ?? [] };
}
