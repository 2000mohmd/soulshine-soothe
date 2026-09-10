// "Connect me to a human" — server-only pieces: the short AI summary a reviewer
// reads, the admin alert email, and the admin-side queue reads.
//
// Nothing here is allowed to block the member: if the summary or the email
// fails, the request row still exists and still shows up in the admin queue.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { callCompanionModel } from "./llm-provider.server";

type Client = SupabaseClient<Database>;

const RESEND_URL = "https://api.resend.com/emails";
const FROM = "Kalm Safety <onboarding@resend.dev>";
const MODEL = "claude-haiku-4-5";

function appBaseUrl(): string {
  return (
    process.env["APP_BASE_URL"] ??
    process.env["VITE_APP_BASE_URL"] ??
    "https://soulshine-soothe.lovable.app"
  );
}

export type HandoffRequestRow = {
  id: string;
  user_id: string;
  status: "queued" | "claimed" | "closed";
  severity: string | null;
  summary: string | null;
  preferred_name: string | null;
  language: string;
  timezone: string | null;
  claimed_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message: string | null;
  last_sender: "user" | "human" | null;
};

/**
 * Condenses the last few turns into a handover note for the person who picks
 * this up. Short on purpose: what's going on, how they sound, what they seem to
 * need. Returns null on any failure — the request still reaches the queue.
 */
export async function summarizeForHuman(
  turns: { sender: string; content: string }[],
  context: { preferredName: string | null; severity: string | null; language: string },
): Promise<string | null> {
  const transcript = turns
    .slice(-12)
    .map((turn) => `${turn.sender === "user" ? "Them" : "Companion"}: ${turn.content}`)
    .join("\n")
    .slice(0, 6000);
  if (!transcript.trim()) return null;

  try {
    const payload = await callCompanionModel({
      model: MODEL,
      maxTokens: 400,
      system: [
        "You write handover notes for a human support worker at Kalm, a mental wellness app.",
        "Someone has just asked to talk to a real person. The worker needs to walk in already knowing the situation.",
        "Write 3-5 short sentences, plain language, in this order: what is going on right now, how they seem to be doing, what they appear to be asking for, and anything the worker should be careful with.",
        "Do not diagnose. Do not rate risk. Do not invent facts. Quote at most one short phrase of theirs.",
        "Write in English so any worker on shift can read it, even if the conversation was in another language — note the conversation language if it is not English.",
        "Reply with the note only, no headings, no bullet points.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            context.preferredName ? `They go by ${context.preferredName}.` : "",
            context.severity ? `An automated safety flag fired at "${context.severity}" level.` : "",
            `Conversation language code: ${context.language}.`,
            "",
            "Recent conversation:",
            transcript,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      tools: [],
    });

    const text = (payload.content ?? [])
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return text ? text.slice(0, 2000) : null;
  } catch (error) {
    console.error("[handoff] summary failed", error);
    return null;
  }
}

/** "Someone is waiting" alert. Contains no conversation content. */
export async function sendHandoffAlertEmail(input: {
  requestId: string;
  severity: string | null;
  createdAt: string;
  escalation?: number;
}): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  const to = process.env["ADMIN_ALERT_EMAIL"];
  if (!apiKey || !to) {
    console.error("[handoff] alert email skipped: RESEND_API_KEY or ADMIN_ALERT_EMAIL missing");
    return false;
  }

  const escalating = (input.escalation ?? 0) > 0;
  const subject = escalating
    ? `URGENT (reminder #${input.escalation}) — someone is still waiting for a human`
    : `Kalm — someone asked to talk to a human${input.severity ? ` (${input.severity})` : ""}`;
  const text = [
    escalating
      ? "A member asked to speak to a human more than 30 minutes ago and nobody has picked it up."
      : "A member asked to speak to a human. They are waiting in the app now.",
    "",
    `Safety flag: ${input.severity ?? "none"}`,
    `Requested at: ${new Date(input.createdAt).toISOString()}`,
    `Request ID: ${input.requestId}`,
    "",
    `Pick it up here: ${appBaseUrl()}/admin/human`,
    "",
    "This alert intentionally contains no conversation content — read it in the app.",
  ].join("\n");

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
    });
    if (!response.ok) {
      console.error(`[handoff] alert email failed [${response.status}]: ${await response.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[handoff] alert email threw", error);
    return false;
  }
}

const ESCALATE_AFTER_MS = 30 * 60 * 1000;

/** Repeats the alert for anything still unclaimed after 30 minutes. */
export async function escalateUnclaimedHandoffs(supabase: Client): Promise<{ escalated: number }> {
  const cutoff = new Date(Date.now() - ESCALATE_AFTER_MS).toISOString();
  const { data, error } = await supabase
    .from("human_support_requests")
    .select("id, created_at, severity, escalation_count, escalation_sent_at")
    .eq("status", "queued")
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) {
    console.error("[handoff] escalation query failed", error);
    return { escalated: 0 };
  }

  let escalated = 0;
  for (const row of data ?? []) {
    const last = row.escalation_sent_at ? new Date(row.escalation_sent_at).getTime() : 0;
    if (last && Date.now() - last < ESCALATE_AFTER_MS) continue;

    const nextCount = (row.escalation_count ?? 0) + 1;
    const sent = await sendHandoffAlertEmail({
      requestId: row.id,
      severity: row.severity,
      createdAt: row.created_at,
      escalation: nextCount,
    });
    if (!sent) continue;

    const update = await supabase
      .from("human_support_requests")
      .update({ escalation_sent_at: new Date().toISOString(), escalation_count: nextCount })
      .eq("id", row.id);
    if (update.error) {
      console.error("[handoff] escalation stamp failed", update.error);
      continue;
    }
    escalated += 1;
  }

  return { escalated };
}

// --- Admin-side reads -------------------------------------------------------

const STATUS_ORDER: Record<string, number> = { queued: 0, claimed: 1, closed: 2 };
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, moderate: 2 };

export async function fetchHandoffQueue(
  supabase: Client,
): Promise<{ requests: HandoffRequestRow[]; waiting: number }> {
  const { data, error } = await supabase
    .from("human_support_requests")
    .select(
      "id, user_id, status, severity, summary, preferred_name, language, timezone, claimed_at, closed_at, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = data ?? [];
  if (!rows.length) return { requests: [], waiting: 0 };

  const messages = await supabase
    .from("human_support_messages")
    .select("request_id, sender, content, created_at")
    .in(
      "request_id",
      rows.map((row) => row.id),
    )
    .order("created_at", { ascending: true });
  if (messages.error) throw messages.error;

  const latest = new Map<string, { sender: "user" | "human"; content: string }>();
  const counts = new Map<string, number>();
  for (const message of messages.data ?? []) {
    latest.set(message.request_id, {
      sender: message.sender as "user" | "human",
      content: message.content,
    });
    counts.set(message.request_id, (counts.get(message.request_id) ?? 0) + 1);
  }

  const requests = rows
    .map((row) => ({
      ...row,
      status: row.status as HandoffRequestRow["status"],
      message_count: counts.get(row.id) ?? 0,
      last_message: latest.get(row.id)?.content ?? null,
      last_sender: latest.get(row.id)?.sender ?? null,
    }))
    .sort((a, b) => {
      const byStatus = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      if (byStatus !== 0) return byStatus;
      const bySeverity =
        (SEVERITY_ORDER[a.severity ?? ""] ?? 9) - (SEVERITY_ORDER[b.severity ?? ""] ?? 9);
      if (bySeverity !== 0) return bySeverity;
      return b.created_at.localeCompare(a.created_at);
    });

  return { requests, waiting: rows.filter((row) => row.status === "queued").length };
}

export async function fetchHandoffDetail(
  supabase: Client,
  requestId: string,
): Promise<{
  request: HandoffRequestRow;
  messages: { id: string; sender: "user" | "human"; content: string; created_at: string }[];
}> {
  const request = await supabase
    .from("human_support_requests")
    .select(
      "id, user_id, status, severity, summary, preferred_name, language, timezone, claimed_at, closed_at, created_at, updated_at",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (request.error) throw request.error;
  if (!request.data) throw new Error("Not found");

  const messages = await supabase
    .from("human_support_messages")
    .select("id, sender, content, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (messages.error) throw messages.error;

  const rows = (messages.data ?? []).map((row) => ({
    id: row.id,
    sender: row.sender as "user" | "human",
    content: row.content,
    created_at: row.created_at,
  }));

  return {
    request: {
      ...request.data,
      status: request.data.status as HandoffRequestRow["status"],
      message_count: rows.length,
      last_message: rows.at(-1)?.content ?? null,
      last_sender: rows.at(-1)?.sender ?? null,
    },
    messages: rows,
  };
}
