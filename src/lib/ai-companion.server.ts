// Server-only AI companion logic: prompt assembly + Anthropic Messages API call
// with native Claude tool use. The deterministic crisis gate (detectCrisis in
// crisis.ts) runs BEFORE any of this and is never delegated to the model.
import { CRISIS_DISCLAIMER } from "./crisis";
import {
  callCompanionModel,
  streamCompanionModel,
  type LlmContentBlock,
  type LlmMessage,
} from "./llm-provider.server";
import {
  CHAT_TOOLS,
  NUDGE_TOOLS,
  runCompanionTool,
  type AnthropicTool,
  type CompanionAction,
  type ToolContext,
} from "./companion-tools.server";

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1024;
const MAX_TOOL_ITERATIONS = 3;

export type CompanionContext = {
  preferredName: string | null;
  accountType: string | null;
  introText: string | null;
  /** Short internal orientation note written at onboarding (care-plan.server.ts). */
  carePlan?: string | null;
  goals: string[];
  stressors: string[];
  communicationPreference: string | null;
  topicsToAvoid: string | null;
  inProfessionalCare: boolean;
  recentMoods: { score: number; note: string | null; tags: string[]; logged_at: string }[];
  history: { sender: string; content: string }[];
  quickAction: string | null;
  pastSummaries?: { summary: string; when: string; commitmentNote: string | null }[];
  screenersDue?: { label: string; due: boolean; lastTaken: string | null }[];
  streakDays?: number;
  dailyPromptResponses?: { prompt: string; response: string; when: string }[];
  /** Still-pending things the person said they'd try, from an earlier chat. */
  openCommitments?: { description: string; ageDays: number }[];
};

const QUICK_ACTION_GUIDANCE: Record<string, string> = {
  anxious:
    "The person selected 'I'm feeling anxious'. Start by slowing the pace: validate the anxiety, then offer one small, concrete regulating step (breath, body, or naming what's happening) before any exploration.",
  reframe:
    "The person selected 'Help me reframe a thought'. Gently invite the specific thought, reflect it back, and explore kinder or more balanced alternatives together — as curiosity, never as correction.",
  grounding:
    "The person selected 'I need a grounding exercise'. Guide one short grounding practice step by step (e.g. 5-4-3-2-1 senses or feet-on-floor), one instruction per line, and check in at the end.",
  sleep:
    "The person selected 'I can't sleep'. Keep the reply short, low-stimulation and soothing. Offer one wind-down practice and avoid problem-solving spirals.",
  vent: "The person selected 'I just want to vent'. Mostly listen and reflect. Do not offer exercises or advice unless they ask.",
};

export function buildSystemPrompt(ctx: CompanionContext): string {
  const lines: string[] = [
    "You are Kalm, a warm, steady mental wellness companion inside the Kalm app.",
    "",
    "TONE: warm, validating, human and unhurried. Short paragraphs. Plain language. Reflect feelings before offering anything. Never clinical, never lecturing, never chirpy or performatively positive.",
    "",
    "HOW YOU TALK: You are running a conversation, not answering a question. Most replies should do ONE of these, not several at once: reflect what they said, ask one specific follow-up question, or guide one small step of something — then stop and wait for them. Do not deliver multi-point advice lists or fully resolve something in a single reply unless they've explicitly asked for a direct answer or summary. Read what kind of message this is before deciding how to respond:\n\nIf it's a direct question or a request for information/help with something concrete (\"what's box breathing?\", \"how do I fall asleep faster?\", \"can you explain X?\"), answer it directly and completely — don't deflect with a question instead of answering. You can still add a brief, genuinely relevant follow-up question at the end if it would meaningfully help (e.g. personalizing the answer to their situation), but it's optional here, not required.\n\nIf it's an emotional, exploratory, or ambiguous share (how they're feeling, something going on in their life, a vague opener), keep using the conversational coaching style: reflect, ask one specific question before advising, one step at a time — a real question is usually the right move here, not optional.\n\nIf they're clearly winding down (thanking you, saying goodbye, topic resolved), let it close naturally instead of asking anything further. The judgment call is: are they asking you to explain/help with something concrete, or are they processing something with you? Answer the first plainly; explore the second with them.",
    "",
    "SCOPE: You're also a general life companion, not only for distress — you're equally comfortable helping with everyday things: a work decision, how to approach a conversation, sleep habits, general reflection, or just someone wanting to think out loud on a good day. Don't assume every conversation is about a problem.",
    "",
    "Mirror first, then ask before you advise. Only introduce a technique or exercise once you understand enough of the specific situation to make it relevant — not as a first response to a vague 'I feel anxious.'",
    "",
    "AVOID: numbered lists of tips, multiple questions stacked in one reply, long restatements of what they said before responding, generic reassurance used as a substitute for a real question, offering an exercise before you understand the situation.",
    "",
    "BOUNDARIES (absolute):",
    "- You are NOT a therapist, doctor or emergency service. Never diagnose, never name or suggest a condition the person hasn't named, never advise on medication, dosage or stopping treatment.",
    "- Do not interpret symptoms clinically. Instead, encourage professional support when something sounds persistent or serious.",
    "- If the person describes danger to themselves or others, stop the normal conversation and direct them to 988 or local emergency services.",
    `- Every reply must be consistent with this standing disclaimer: "${CRISIS_DISCLAIMER}"`,
    "- Most replies should be 2-5 sentences. Only go longer when actively guiding a multi-step exercise inline, or when they've clearly asked for something more thorough.",
    "",
    "HUMAN SUPPORT (anti-dependency): you are a companion, not the person's only support. If the same emotional theme keeps returning across several messages or days, gently ask — once, warmly, and not every time — whether there is a person in their life (friend, family member, partner, therapist) they could share this with too. Frame it as wanting them to have more support around them, never as ending the conversation, being unable to cope, or pushing them away. If they say there is nobody, stay with them and do not repeat the suggestion.",
    "",
    "PERSONALIZATION: you have context about this person below. Reference their own words, goals and stressors gently and sparingly, only when relevant — it should feel like being remembered, not analysed. Never recite the context back at them.",
    "",
    "--- PERSON CONTEXT ---",
  ];

  if (ctx.preferredName) lines.push(`Preferred name: ${ctx.preferredName}`);
  if (ctx.accountType === "teen") {
    lines.push(
      "Account mode: TEEN. Use age-appropriate language, extra care, no adult-oriented content, and encourage a trusted adult where it fits naturally.",
    );
  }
  if (ctx.introText) lines.push(`How they introduced themselves: ${ctx.introText}`);
  if (ctx.carePlan)
    lines.push(
      "",
      "--- YOUR STARTING PLAN FOR THIS PERSON (internal, written when they joined) ---",
      ctx.carePlan,
      "Use this to know who they are, what pace and tone suit them, and what is worth gently offering. Never read it out, quote it, or refer to having a plan or notes about them.",
      "--- END STARTING PLAN ---",
      "",
    );
  if (ctx.goals.length) lines.push(`Their stated goals: ${ctx.goals.join(", ")}`);
  if (ctx.stressors.length) lines.push(`Current stressors: ${ctx.stressors.join(", ")}`);
  if (ctx.communicationPreference)
    lines.push(`How they like to be spoken to: ${ctx.communicationPreference}`);
  if (ctx.topicsToAvoid) lines.push(`NEVER bring up these topics unprompted: ${ctx.topicsToAvoid}`);
  if (ctx.inProfessionalCare)
    lines.push(
      "They are already working with a professional — support that relationship, never contradict or replace it.",
    );

  if (ctx.recentMoods.length) {
    const summary = ctx.recentMoods
      .map((mood) => {
        const day = new Date(mood.logged_at).toISOString().slice(0, 10);
        const extras = [mood.tags.join("/"), mood.note].filter(Boolean).join(" — ");
        return `${day}: ${mood.score}/5${extras ? ` (${extras})` : ""}`;
      })
      .join("; ");
    lines.push(`Recent mood check-ins (newest first): ${summary}`);
  } else {
    lines.push("No mood check-ins logged yet.");
  }

  if (ctx.pastSummaries?.length) {
    lines.push("", "--- RECENT PAST CONVERSATIONS ---");
    for (const entry of ctx.pastSummaries) {
      lines.push(
        `(${entry.when}) ${entry.summary}${entry.commitmentNote ? ` Follow-through: ${entry.commitmentNote}` : ""}`,
      );
    }
    lines.push(
      "You have summaries of recent past conversations above. Reference them naturally when relevant, the way someone remembers a past conversation with a person they check in with regularly — don't recite them verbatim or announce that you're reading notes.",
      "--- END RECENT PAST CONVERSATIONS ---",
    );
  }

  if (ctx.openCommitments?.length) {
    lines.push(
      "",
      "--- STILL OPEN FROM AN EARLIER CONVERSATION ---",
      ...ctx.openCommitments.map(
        (entry) =>
          `"${entry.description}" — said about ${Math.round(entry.ageDays)} day(s) ago, not closed out yet.`,
      ),
      'These are things they once said they\'d try. Only bring one up if it flows naturally or they raise it themselves — the tone is a friend who genuinely remembered, never a task list or a check-up. If it didn\'t happen, be curious about what got in the way, never disappointed. If they tell you one is done, or that they\'ve let it go, call complete_commitment (status "done" or "skipped"). Never use the words "commitment", "task", "accountability" or streak language.',
      "--- END STILL OPEN ---",
    );
  }

  if (ctx.screenersDue?.length) {
    lines.push(
      "",
      `Periodic check-in status: ${ctx.screenersDue
        .map(
          (entry) =>
            `${entry.label} — ${entry.due ? "due now" : "not due"}${entry.lastTaken ? ` (last taken ${entry.lastTaken})` : " (never taken)"}`,
        )
        .join("; ")}`,
    );
  }

  if (ctx.dailyPromptResponses?.length) {
    lines.push(
      "",
      "Recent daily reflection answers (a light ritual, NOT a clinical measure — never score, analyse or treat these as risk signals):",
      ...ctx.dailyPromptResponses.map(
        (entry) => `(${entry.when}) "${entry.prompt}" → ${entry.response}`,
      ),
    );
  }

  if ((ctx.streakDays ?? 0) >= 3) {
    lines.push(
      "",
      `Consistency: they have shown up ${ctx.streakDays} days in a row (check-in, exercise or daily reflection). If it fits naturally, you may acknowledge this warmly ONCE in a single sentence, in your own words. Never repeat it in later replies, never state it as a counter or streak score, and never imply they'd lose anything by missing a day.`,
    );
  }

  lines.push("--- END PERSON CONTEXT ---");

  lines.push(
    "",
    "TOOLS: you have a few tools that let you act inside the app rather than only talk.",
    "- Prefer get_effectiveness_insights before suggesting a practice, so suggestions come from what has actually helped this person, not a guess.",
    "- For breathing or grounding exercises, use show_exercise_widget instead of get_exercise_steps — do not narrate these step by step yourself; the inline player handles the steps, timing and mood check, so you only need one warm sentence introducing it.",
    "- For thought records, behavioral activation, or journaling / worry time, keep using get_exercise_steps and walking through it conversationally as before — one step per message, waiting for their reply — then complete_exercise_in_chat. Reserve launch_exercise (opening the dedicated page) for when they explicitly ask to open the Exercises page.",
    "- Use log_mood only when they have clearly told you how they're feeling and it makes sense to save it, and create_commitment only when they have named one small concrete thing themselves.",
    "- If a screener is due (same logic the check-ins page uses — roughly every 2 weeks) and it fits naturally in the conversation, you can offer to do it right here in chat instead of sending them to a separate page, using get_screener_questions and then submit_screener_in_chat. Ask one item at a time in your own words. Never force it if the conversation is focused elsewhere.",
    "- suggest_stepup is for the 'this has been heavy for a while' zone, not acute risk — acute risk is handled elsewhere before you see the message.",
    "- Never announce that you are using a tool. Just do it, then mention plainly what you saved or opened.",
  );

  if (ctx.quickAction && QUICK_ACTION_GUIDANCE[ctx.quickAction]) {
    lines.push("", `QUICK ACTION: ${QUICK_ACTION_GUIDANCE[ctx.quickAction]}`);
  } else if (ctx.history.length === 0) {
    lines.push(
      "",
      "SESSION START: This is the start of a new conversation. Unless they've already given enough detail to respond to directly, get a clearer picture first — ask what's going on or what brought them here right now, rather than jumping to advice.",
    );
  }

  return lines.join("\n");
}

type AnthropicContentBlock = LlmContentBlock;
type AnthropicMessage = LlmMessage;
type AnthropicResponse = {
  content?: AnthropicContentBlock[];
  stop_reason?: string | null;
  usage: { inputTokens: number; outputTokens: number };
  provider: "openrouter" | "lovable";
};

/** Anthropic first, automatic Lovable AI fallback — same tools either way. */
async function callAnthropic(
  system: string,
  messages: AnthropicMessage[],
  tools: AnthropicTool[],
): Promise<AnthropicResponse> {
  return callCompanionModel({ model: MODEL, maxTokens: MAX_TOKENS, system, messages, tools });
}

function collectText(blocks: AnthropicContentBlock[] | undefined) {
  return (blocks ?? [])
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export type CompanionUsage = {
  inputTokens: number;
  outputTokens: number;
  provider: string;
  model: string;
};

export type CompanionReply = {
  text: string;
  actions: CompanionAction[];
  /** Summed token usage across every provider call in the tool loop. */
  usage: CompanionUsage;
};

/**
 * Runs the standard Anthropic tool-use loop: send with tools, execute any
 * tool_use blocks server-side, feed tool_result blocks back, repeat up to
 * MAX_TOOL_ITERATIONS, then fall back to whatever text we have.
 */
export async function generateCompanionReply(
  ctx: CompanionContext,
  userMessage: string,
  toolContext: ToolContext,
): Promise<CompanionReply> {
  const system = buildSystemPrompt(ctx);

  const messages: AnthropicMessage[] = [
    ...ctx.history.map((entry) => ({
      role: entry.sender === "assistant" ? ("assistant" as const) : ("user" as const),
      content: entry.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  const actions: CompanionAction[] = [];
  let lastText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let provider = "openrouter";
  const reply = (text: string): CompanionReply => ({
    text,
    actions,
    usage: { inputTokens, outputTokens, provider, model: MODEL },
  });

  for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration += 1) {
    const payload = await callAnthropic(system, messages, CHAT_TOOLS);
    inputTokens += payload.usage.inputTokens;
    outputTokens += payload.usage.outputTokens;
    provider = payload.provider;
    const blocks = payload.content ?? [];
    const text = collectText(blocks);
    if (text) lastText = text;

    const toolUses = blocks.filter(
      (
        block,
      ): block is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        block.type === "tool_use",
    );

    if (
      payload.stop_reason !== "tool_use" ||
      toolUses.length === 0 ||
      iteration === MAX_TOOL_ITERATIONS
    ) {
      if (lastText) return reply(lastText);
      break;
    }

    messages.push({ role: "assistant", content: blocks });

    const results: AnthropicContentBlock[] = [];
    for (const call of toolUses) {
      let outcome;
      try {
        outcome = await runCompanionTool(call.name, call.input ?? {}, toolContext);
      } catch (error) {
        console.error("companion tool failed", call.name, error);
        outcome = { result: "That action failed. Continue the conversation without it." };
      }
      if (outcome.action) actions.push(outcome.action);
      results.push({ type: "tool_result", tool_use_id: call.id, content: outcome.result });
    }
    messages.push({ role: "user", content: results });
  }

  if (lastText) return reply(lastText);
  throw new Error("The companion couldn't reply just now. Please try again.");
}

/**
 * Streaming counterpart to generateCompanionReply, used by the
 * POST /api/v1/chat/messages/stream path (see chat.functions.ts's
 * sendMessageStreamCore). Same tool-use loop and same tools; the only
 * difference is that each iteration streams its text via `onDelta` as it's
 * generated, through streamCompanionModel, instead of waiting for the whole
 * completion.
 *
 * TEXT ACCUMULATION DIFFERS FROM generateCompanionReply ON PURPOSE: the
 * non-streaming version keeps only the LAST iteration's text (any preamble an
 * earlier iteration produced before deciding to call a tool is discarded,
 * since the user never saw it). Here, every iteration's text has already been
 * streamed live to the client as it was generated — discarding an earlier
 * iteration's text would leave the persisted message shorter than what the
 * person actually watched appear on screen. So streamed text is
 * concatenated across iterations instead of overwritten.
 */
export async function generateCompanionReplyStream(
  ctx: CompanionContext,
  userMessage: string,
  toolContext: ToolContext,
  onDelta: (text: string) => void,
): Promise<CompanionReply> {
  const system = buildSystemPrompt(ctx);

  const messages: AnthropicMessage[] = [
    ...ctx.history.map((entry) => ({
      role: entry.sender === "assistant" ? ("assistant" as const) : ("user" as const),
      content: entry.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  const actions: CompanionAction[] = [];
  const textParts: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let provider = "openrouter";
  const reply = (): CompanionReply => ({
    text: textParts.join("\n\n").trim(),
    actions,
    usage: { inputTokens, outputTokens, provider, model: MODEL },
  });

  for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration += 1) {
    const payload = await streamCompanionModel(
      { model: MODEL, maxTokens: MAX_TOKENS, system, messages, tools: CHAT_TOOLS },
      onDelta,
    );
    inputTokens += payload.usage.inputTokens;
    outputTokens += payload.usage.outputTokens;
    provider = payload.provider;
    const blocks = payload.content ?? [];
    const text = collectText(blocks);
    if (text) textParts.push(text);

    const toolUses = blocks.filter(
      (
        block,
      ): block is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        block.type === "tool_use",
    );

    if (
      payload.stop_reason !== "tool_use" ||
      toolUses.length === 0 ||
      iteration === MAX_TOOL_ITERATIONS
    ) {
      if (textParts.length) return reply();
      break;
    }

    messages.push({ role: "assistant", content: blocks });

    const results: AnthropicContentBlock[] = [];
    for (const call of toolUses) {
      let outcome;
      try {
        outcome = await runCompanionTool(call.name, call.input ?? {}, toolContext);
      } catch (error) {
        console.error("companion tool failed", call.name, error);
        outcome = { result: "That action failed. Continue the conversation without it." };
      }
      if (outcome.action) actions.push(outcome.action);
      results.push({ type: "tool_result", tool_use_id: call.id, content: outcome.result });
    }
    messages.push({ role: "user", content: results });
  }

  if (textParts.length) return reply();
  throw new Error("The companion couldn't reply just now. Please try again.");
}

/**
 * Proactive coaching: same prompt-assembly and model as chat, but read-only
 * tools — nudges are one-shot generations, not a back-and-forth.
 */
export async function generateNudgeMessage(
  ctx: CompanionContext,
  instruction: string,
  toolContext?: ToolContext,
): Promise<string> {
  const system = buildSystemPrompt(ctx);

  const messages: AnthropicMessage[] = [
    {
      role: "user" as const,
      content: [
        "You are writing a short proactive message that will appear in the app as a gentle nudge — the person did not ask a question.",
        "Rules: 2-4 sentences maximum. Warm, unhurried, never guilt-inducing, never alarming, no bullet points, no headings, no sign-off.",
        "Do not diagnose, do not imply failure, and do not mention that this was triggered by data analysis.",
        "",
        `Situation: ${instruction}`,
      ].join("\n"),
    },
  ];

  const tools = toolContext ? NUDGE_TOOLS : [];
  let lastText = "";

  for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration += 1) {
    const payload = await callAnthropic(system, messages, tools);
    const blocks = payload.content ?? [];
    const text = collectText(blocks);
    if (text) lastText = text;

    const toolUses = blocks.filter(
      (
        block,
      ): block is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        block.type === "tool_use",
    );

    if (
      !toolContext ||
      payload.stop_reason !== "tool_use" ||
      toolUses.length === 0 ||
      iteration === MAX_TOOL_ITERATIONS
    ) {
      break;
    }

    messages.push({ role: "assistant", content: blocks });
    const results: AnthropicContentBlock[] = [];
    for (const call of toolUses) {
      let outcome;
      try {
        outcome = await runCompanionTool(call.name, call.input ?? {}, toolContext);
      } catch (error) {
        console.error("nudge tool failed", call.name, error);
        outcome = { result: "That lookup failed. Write the nudge without it." };
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: outcome.result });
    }
    messages.push({ role: "user", content: results });
  }

  if (!lastText) throw new Error("Could not generate a nudge right now.");
  return lastText;
}
