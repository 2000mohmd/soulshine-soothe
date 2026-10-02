// Server-side tool implementations for the Claude-powered companion.
// NOTE: none of these tools touch crisis handling. The deterministic
// detectCrisis() gate in crisis.ts runs before this file is ever reached.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SCREENERS, SCREENER_CHOICES, SCREENER_FRAMING, type ScreenerType } from "./screeners";
import { isGuidedWidgetCategory } from "./exercise-types";

type Client = SupabaseClient<Database>;

/** A user-visible record of something the model actually did. */
export type CompanionAction =
  | { type: "mood_logged"; score: number; tags: string[]; summary: string }
  | { type: "commitment_created"; id: string; description: string; summary: string }
  | {
      type: "commitment_completed";
      id: string;
      description: string;
      status: "done" | "skipped";
      summary: string;
    }
  | { type: "exercise_launch"; slug: string; title: string; minutes: number; summary: string }
  | { type: "exercise_completed"; slug: string; title: string; summary: string }
  | { type: "exercise_widget"; slug: string; title: string; summary: string }
  | {
      type: "screener_completed";
      screener_type: "phq9" | "gad7";
      total_score: number;
      severity: string;
      crisis: boolean;
      summary: string;
    }
  | { type: "stepup_suggested"; summary: string }
  | { type: "human_support_requested"; request_id: string; summary: string };

export type ToolContext = {
  supabase: Client;
  userId: string;
  threadId: string | null;
};

export type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

const LOG_MOOD: AnthropicTool = {
  name: "log_mood",
  description:
    "Record a mood check-in for the person, on a 1-5 scale where 1 is very low and 5 is good. Only use this when the person has clearly told you how they are feeling and it makes sense to save it. Mention afterwards that you saved it.",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "integer", description: "Mood from 1 (very low) to 5 (good)" },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Short lowercase themes, e.g. work, sleep, lonely",
      },
      note: { type: "string", description: "Optional short note in the person's own words" },
    },
    required: ["score"],
  },
};

const CREATE_COMMITMENT: AnthropicTool = {
  name: "create_commitment",
  description:
    "Start tracking one small, concrete thing the person has said they will try. Use only when they have named something specific and agreed to it — never to assign them homework.",
  input_schema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "The specific action in the person's own words, e.g. 'text Sam tomorrow'",
      },
    },
    required: ["description"],
  },
};

const COMPLETE_COMMITMENT: AnthropicTool = {
  name: "complete_commitment",
  description:
    'Close out something the person previously said they would try — ONLY when they\'ve told you where it stands. Use status "done" if they did it, status "skipped" if they\'ve decided to let it go (both are fine, neither is a failure). Optionally pass a few words from the original wording so the right one is matched; otherwise the most recent open one is used. Never use this to chase or pressure them.',
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["done", "skipped"] },
      description: {
        type: "string",
        description: "A few words from the original, to match the right open item",
      },
    },
    required: ["status"],
  },
};

const GET_EFFECTIVENESS_INSIGHTS: AnthropicTool = {
  name: "get_effectiveness_insights",
  description:
    "Read what has actually helped this person before, based on their own exercise and habit history and mood changes. Use this before suggesting anything, so suggestions are grounded in their data rather than guessed.",
  input_schema: { type: "object", properties: {} },
};

const LAUNCH_EXERCISE: AnthropicTool = {
  name: "launch_exercise",
  description:
    "Hand off to a structured guided exercise in the app instead of describing the steps in prose. Valid slugs come from get_effectiveness_insights or from these: cbt-thought-record, behavioral-activation, grounding-54321, box-breathing, worry-time.",
  input_schema: {
    type: "object",
    properties: { exercise_slug: { type: "string" } },
    required: ["exercise_slug"],
  },
};

const SUGGEST_STEPUP: AnthropicTool = {
  name: "suggest_stepup",
  description:
    "Signal that this conversation suggests the person could use more support than you can offer, so the app surfaces professional care options. This is NOT for acute risk, which is handled separately before you ever see the message. Use sparingly, warmly, and never as a way to end the conversation.",
  input_schema: { type: "object", properties: {} },
};

const GET_EXERCISE_STEPS: AnthropicTool = {
  name: "get_exercise_steps",
  description:
    "Read the ordered steps of an exercise so you can walk the person through it inline, one step per message, inside the conversation. Valid slugs: cbt-thought-record, behavioral-activation, grounding-54321, box-breathing, worry-time.",
  input_schema: {
    type: "object",
    properties: { exercise_slug: { type: "string" } },
    required: ["exercise_slug"],
  },
};

const SHOW_EXERCISE_WIDGET: AnthropicTool = {
  name: "show_exercise_widget",
  description:
    "Show a self-contained interactive guided player inline in the chat for a timed or passive exercise — grounding or breathing only (slugs: grounding-54321, box-breathing, teen-grounding-54321). Use this INSTEAD of get_exercise_steps for those, because they need no back-and-forth. The widget handles the steps, the timing and the before/after mood check itself.",
  input_schema: {
    type: "object",
    properties: { exercise_slug: { type: "string" } },
    required: ["exercise_slug"],
  },
};

const COMPLETE_EXERCISE_IN_CHAT: AnthropicTool = {
  name: "complete_exercise_in_chat",
  description:
    "Record that the person completed an exercise with you inside the conversation, so it counts the same as doing it on the Exercises page. Use only after you have actually walked them through the steps.",
  input_schema: {
    type: "object",
    properties: {
      exercise_slug: { type: "string" },
      mood_before: { type: "integer", description: "Mood 1-5 before, if known" },
      mood_after: { type: "integer", description: "Mood 1-5 after, if known" },
      response_summary: {
        type: "string",
        description: "Brief summary of what they shared during the exercise, not verbatim",
      },
    },
    required: ["exercise_slug"],
  },
};

const GET_SCREENER_QUESTIONS: AnthropicTool = {
  name: "get_screener_questions",
  description:
    "Read the standard item text of a validated check-in questionnaire (PHQ-9 for low mood, GAD-7 for anxiety) so you can ask the items conversationally, one at a time, inside the chat.",
  input_schema: {
    type: "object",
    properties: { screener_type: { type: "string", enum: ["phq9", "gad7"] } },
    required: ["screener_type"],
  },
};

const SUBMIT_SCREENER_IN_CHAT: AnthropicTool = {
  name: "submit_screener_in_chat",
  description:
    "Record a completed check-in questionnaire the person answered with you in conversation. Responses are 0-3 per item in the original item order (0 = not at all, 1 = several days, 2 = more than half the days, 3 = nearly every day). PHQ-9 needs 9 responses, GAD-7 needs 7. Only use this after they have actually answered every item.",
  input_schema: {
    type: "object",
    properties: {
      screener_type: { type: "string", enum: ["phq9", "gad7"] },
      responses: { type: "array", items: { type: "integer" } },
    },
    required: ["screener_type", "responses"],
  },
};

const REQUEST_HUMAN_SUPPORT: AnthropicTool = {
  name: "request_human_support",
  description:
    "Ask a real human mental-health coach from the Kalm team to join this conversation. Use when the person asks for a real person/human/therapist/coach, or clearly needs more help than you can give. Creates a request with a summary; their replies then go to the human coach in the app.",
  input_schema: {
    type: "object",
    properties: {
      note: { type: "string", description: "One short line, in their words, of what they need help with." },
      urgent: { type: "boolean", description: "True if they seem in acute distress." },
    },
    required: [],
  },
};

/** Full conversational tool set. */
export const CHAT_TOOLS: AnthropicTool[] = [
  LOG_MOOD,
  CREATE_COMMITMENT,
  COMPLETE_COMMITMENT,
  GET_EFFECTIVENESS_INSIGHTS,
  GET_EXERCISE_STEPS,
  SHOW_EXERCISE_WIDGET,
  COMPLETE_EXERCISE_IN_CHAT,
  GET_SCREENER_QUESTIONS,
  SUBMIT_SCREENER_IN_CHAT,
  LAUNCH_EXERCISE,
  SUGGEST_STEPUP,
  REQUEST_HUMAN_SUPPORT,
];

/** Nudges are one-shot generations: read-only tools only. */
export const NUDGE_TOOLS: AnthropicTool[] = [GET_EFFECTIVENESS_INSIGHTS];

export type ToolOutcome = { result: string; action?: CompanionAction };

/** Executes one tool call and returns text for the model plus an optional user-visible action. */
export async function runCompanionTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const { supabase, userId } = ctx;

  if (name === "log_mood") {
    const raw = Number(input["score"]);
    const score = Math.min(5, Math.max(1, Math.round(Number.isFinite(raw) ? raw : 3)));
    const tags = Array.isArray(input["tags"])
      ? (input["tags"] as unknown[]).map((tag) => String(tag).slice(0, 40)).slice(0, 10)
      : [];
    const note = typeof input["note"] === "string" ? input["note"].slice(0, 500) : null;

    const { error } = await supabase.from("mood_logs").insert({
      user_id: userId,
      score,
      note,
      tags,
      is_baseline: false,
    });
    if (error) return { result: `Could not save the mood check-in: ${error.message}` };

    return {
      result: `Saved a mood check-in of ${score}/5${tags.length ? ` tagged ${tags.join(", ")}` : ""}.`,
      action: {
        type: "mood_logged",
        score,
        tags,
        summary: `Logged your mood as ${score}/5${tags.length ? ` (${tags.join(", ")})` : ""}.`,
      },
    };
  }

  if (name === "create_commitment") {
    const description = String(input["description"] ?? "")
      .trim()
      .slice(0, 300);
    if (!description) return { result: "No commitment description was provided." };

    const { data, error } = await supabase
      .from("commitments")
      .insert({
        user_id: userId,
        description,
        source: "chat",
        thread_id: ctx.threadId,
      })
      .select("id, description")
      .single();
    if (error) return { result: `Could not save the commitment: ${error.message}` };

    return {
      result: `Now tracking the commitment: "${data.description}".`,
      action: {
        type: "commitment_created",
        id: data.id,
        description: data.description,
        summary: `Started tracking: "${data.description}".`,
      },
    };
  }

  if (name === "complete_commitment") {
    const status = input["status"] === "skipped" ? "skipped" : "done";
    const match = String(input["description"] ?? "")
      .trim()
      .toLowerCase();

    const { data: open, error: readError } = await supabase
      .from("commitments")
      .select("id, description")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10);
    if (readError) return { result: `Could not read open commitments: ${readError.message}` };
    const list = open ?? [];

    const target =
      (match
        ? list.find(
            (row) =>
              row.description.toLowerCase().includes(match) ||
              match.includes(row.description.toLowerCase()),
          )
        : undefined) ?? list[0];
    if (!target) {
      return { result: "There's nothing open to close right now — don't invent one." };
    }

    const { error } = await supabase
      .from("commitments")
      .update({
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id)
      .eq("user_id", userId);
    if (error) return { result: `Could not update it: ${error.message}` };

    return {
      result:
        status === "done"
          ? `Closed out "${target.description}" as done. Reflect their news warmly and briefly; don't make a big deal of it.`
          : `Closed out "${target.description}" as let go. Make clear that's completely fine — an intention that no longer fits is not a failure.`,
      action: {
        type: "commitment_completed",
        id: target.id,
        description: target.description,
        status,
        summary:
          status === "done"
            ? `Marked "${target.description}" as done.`
            : `Let go of "${target.description}".`,
      },
    };
  }

  if (name === "get_effectiveness_insights") {
    // Reads only — effectiveness_insights is kept fresh by the scheduled
    // effectiveness_recompute job + the sweep, so no on-demand admin recompute.
    const { data, error } = await supabase
      .from("effectiveness_insights")
      .select("subject_type, subject_key, subject_label, sample_size, avg_mood_delta, confidence")
      .eq("user_id", userId)
      .order("avg_mood_delta", { ascending: false })
      .limit(5);
    if (error) return { result: `Could not read insights: ${error.message}` };
    if (!data || data.length === 0) {
      return {
        result:
          "No effectiveness data yet — this person hasn't completed enough exercises with before/after mood for patterns to show. Do not claim to know what works for them.",
      };
    }
    return {
      result: data
        .map(
          (row) =>
            `${row.subject_label} (slug: ${row.subject_key}) — average mood change ${row.avg_mood_delta > 0 ? "+" : ""}${row.avg_mood_delta} across ${row.sample_size} completions, confidence ${row.confidence}`,
        )
        .join("\n"),
    };
  }

  if (name === "get_exercise_steps") {
    const slug = String(input["exercise_slug"] ?? "").trim();
    const { data, error } = await supabase
      .from("exercises")
      .select("id, slug, title, intro_text, steps, estimated_minutes")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return { result: `Could not look up that exercise: ${error.message}` };
    if (!data) return { result: `No exercise exists with slug "${slug}". Do not offer it.` };

    const steps = Array.isArray(data.steps) ? data.steps : [];
    const rendered = steps
      .map((step, index) => {
        const obj = (step ?? {}) as Record<string, unknown>;
        const prompt = String(obj["prompt"] ?? obj["text"] ?? obj["label"] ?? "");
        const inputType = obj["input_type"] ?? obj["inputType"];
        return `${index + 1}. ${prompt}${inputType ? ` [expects: ${String(inputType)}]` : ""}`;
      })
      .join("\n");

    return {
      result: [
        `Exercise "${data.title}" (id: ${data.id}, slug: ${data.slug}). Intro: ${data.intro_text}`,
        rendered || "(no steps recorded)",
        "",
        "Walk the person through these steps ONE AT A TIME in the conversation, in your own words, waiting for their reply before moving to the next step. Do not paste all steps into one message. When you reach the end, use complete_exercise_in_chat to record it.",
      ].join("\n"),
    };
  }

  if (name === "show_exercise_widget") {
    const slug = String(input["exercise_slug"] ?? "").trim();
    const { data, error } = await supabase
      .from("exercises")
      .select("slug, title, category, intro_text")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return { result: `Could not look up that exercise: ${error.message}` };
    if (!data) return { result: `No exercise exists with slug "${slug}". Do not offer it.` };
    if (!isGuidedWidgetCategory(data.category)) {
      return {
        result: `${data.title} is a ${data.category} exercise, which needs a real reply at each step. Use get_exercise_steps and walk through it conversationally instead.`,
      };
    }
    if (!ctx.threadId) {
      return {
        result:
          "There is no active conversation to show the widget in. Use get_exercise_steps instead.",
      };
    }

    const inserted = await supabase.from("chat_messages").insert({
      thread_id: ctx.threadId,
      user_id: userId,
      sender: "system",
      content_type: "exercise_widget",
      exercise_slug: data.slug,
      content: data.title,
    });
    if (inserted.error) return { result: `Could not show the widget: ${inserted.error.message}` };

    return {
      result: `The guided exercise "${data.title}" is now showing inline below your message — just say something brief and warm introducing it (one sentence), you do not need to narrate the steps yourself.`,
      action: {
        type: "exercise_widget",
        slug: data.slug,
        title: data.title,
        summary: `Opened ${data.title} right here.`,
      },
    };
  }

  if (name === "complete_exercise_in_chat") {
    const slug = String(input["exercise_slug"] ?? "").trim();
    const { data: exercise, error: lookupError } = await supabase
      .from("exercises")
      .select("id, slug, title")
      .eq("slug", slug)
      .maybeSingle();
    if (lookupError) return { result: `Could not look up that exercise: ${lookupError.message}` };
    if (!exercise) return { result: `No exercise exists with slug "${slug}".` };

    const clamp = (value: unknown) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return null;
      return Math.min(5, Math.max(1, Math.round(num)));
    };
    const moodBefore = clamp(input["mood_before"]);
    const moodAfter = clamp(input["mood_after"]);
    const summary =
      typeof input["response_summary"] === "string"
        ? input["response_summary"].slice(0, 1000)
        : null;

    const { error } = await supabase.from("exercise_completions").insert({
      user_id: userId,
      exercise_id: exercise.id,
      mood_before: moodBefore,
      mood_after: moodAfter,
      response_data: {
        source: "chat",
        thread_id: ctx.threadId,
        ...(summary ? { response_summary: summary } : {}),
      },
    });
    if (error) return { result: `Could not record the exercise: ${error.message}` };

    // Keep effectiveness_insights fresh (see effectiveness_recompute job).
    if (moodBefore != null && moodAfter != null) {
      try {
        const { enqueueJob } = await import("@/jobs");
        await enqueueJob(supabase, { kind: "effectiveness_recompute", userId });
      } catch (enqueueError) {
        console.error("effectiveness recompute enqueue failed", enqueueError);
      }
    }

    return {
      result: `Recorded that they completed ${exercise.title} with you in chat. Mention plainly that you saved it, then stay with them.`,
      action: {
        type: "exercise_completed",
        slug: exercise.slug,
        title: exercise.title,
        summary: `Saved that you completed "${exercise.title}" here in chat.`,
      },
    };
  }

  if (name === "get_screener_questions") {
    const type = String(input["screener_type"] ?? "") as ScreenerType;
    const screener = SCREENERS[type];
    if (!screener) return { result: `Unknown screener type "${type}". Use phq9 or gad7.` };

    return {
      result: [
        `${screener.label}. Framing: ${screener.prompt} ${SCREENER_FRAMING}`,
        "Items, in order (index 0 first):",
        ...screener.items.map((item, index) => `${index}. ${item}`),
        `Answer scale per item: ${SCREENER_CHOICES.map((choice) => `${choice.value} = ${choice.label}`).join(", ")}.`,
        "",
        "Ask ONE question at a time, in your own words, waiting for a reply before the next — do not list all questions in one message. Keep track of each answer as a 0-3 value in item order, and when every item is answered call submit_screener_in_chat with the full array.",
      ].join("\n"),
    };
  }

  if (name === "submit_screener_in_chat") {
    const type = String(input["screener_type"] ?? "") as ScreenerType;
    const screener = SCREENERS[type];
    if (!screener) return { result: `Unknown screener type "${type}". Use phq9 or gad7.` };

    const raw = Array.isArray(input["responses"]) ? (input["responses"] as unknown[]) : [];
    const responses = raw.map((value) => {
      const num = Number(value);
      return Math.min(3, Math.max(0, Number.isFinite(num) ? Math.round(num) : 0));
    });
    if (responses.length !== screener.items.length) {
      return {
        result: `That is ${responses.length} answers but ${screener.label} has ${screener.items.length} items. Ask the remaining questions one at a time before recording it.`,
      };
    }

    // Same underlying logic the check-ins page uses, including the PHQ-9
    // item-9 crisis escalation. Never reimplemented here.
    const { submitScreenerCore } = await import("./screeners.server");
    let saved;
    try {
      saved = await submitScreenerCore(supabase, userId, { screener_type: type, responses });
    } catch (error) {
      return {
        result: `Could not record the check-in: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }

    const base = `Recorded ${screener.label}: ${saved.total_score} of ${screener.items.length * 3}, ${saved.severity} range. Share the score plainly and warmly, remind them it is a pattern signal and not a diagnosis, and stay in the conversation.`;

    return {
      result: saved.crisisTriggered
        ? `${base}\n\nIMPORTANT: their answer to the self-harm item was above zero. The app is showing crisis resources alongside your reply. Respond with care, name it directly and gently, encourage them to reach out to 988 or local emergency services or someone they trust right now, and do not move on to other topics.`
        : base,
      action: {
        type: "screener_completed",
        screener_type: type,
        total_score: saved.total_score,
        severity: saved.severity,
        crisis: saved.crisisTriggered,
        summary: `Saved your ${screener.label} check-in — ${saved.total_score} (${saved.severity} range).`,
      },
    };
  }

  if (name === "launch_exercise") {
    const slug = String(input["exercise_slug"] ?? "").trim();
    const { data, error } = await supabase
      .from("exercises")
      .select("slug, title, intro_text, estimated_minutes, category")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return { result: `Could not look up that exercise: ${error.message}` };
    if (!data) return { result: `No exercise exists with slug "${slug}". Do not offer it.` };

    return {
      result: `Exercise available: ${data.title} (${data.estimated_minutes} min, ${data.category}). ${data.intro_text} The app is showing the person a button to open it, so invite them into it briefly instead of listing the steps.`,
      action: {
        type: "exercise_launch",
        slug: data.slug,
        title: data.title,
        minutes: data.estimated_minutes,
        summary: `Opened up "${data.title}" for you (${data.estimated_minutes} min).`,
      },
    };
  }

  if (name === "suggest_stepup") {
    return {
      result:
        "The app is now showing this person a small set of professional care options alongside your reply. Acknowledge it warmly and briefly, make clear it isn't a diagnosis or something they did wrong, and stay in the conversation with them.",
      action: {
        type: "stepup_suggested",
        summary: "Shared some options for more support.",
      },
    };
  }

  if (name === "request_human_support") {
    try {
      const { requestHumanSupportCore } = await import("./human-handoff.functions");
      const note = typeof input["note"] === "string" ? input["note"].slice(0, 500) : null;
      const created = await requestHumanSupportCore(supabase, userId, {
        thread_id: ctx.threadId,
        note,
        severity: input["urgent"] === true ? "high" : null,
      });
      return {
        result: created.already_open
          ? "A human coach request was already open; their note was added. Tell them warmly a human coach will reply right here in the app."
          : "A human coach request was created. Tell them warmly, in one or two sentences, that a human coach from the team has been asked to join and their replies will appear right here. Do not promise an exact time.",
        action: {
          type: "human_support_requested",
          request_id: created.request_id,
          summary: "Asked a human coach to join you.",
        },
      };
    } catch (error) {
      console.error("request_human_support failed", error);
      return { result: "Could not reach the human team right now. Point them to the 'Connect to a human' button and the crisis lines if they feel unsafe." };
    }
  }

  return { result: `Unknown tool: ${name}` };
}
