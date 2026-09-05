// The "who is this person" plan, generated once at the end of onboarding from
// what they told us, then refreshed on demand. It is short, plain-language and
// non-clinical: it never names a condition, never diagnoses, and never prescribes.
// Every AI surface (chat, nudges, calls, reactions) reads it through
// CompanionContext.carePlan so the whole app starts out knowing them.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { callCompanionModel } from "./llm-provider.server";

type Client = SupabaseClient<Database>;

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 600;

export type CarePlanInput = {
  preferredName: string | null;
  accountType: string | null;
  introText: string | null;
  goals: string[];
  stressors: string[];
  communicationPreference: string | null;
  topicsToAvoid: string | null;
  inProfessionalCare: boolean;
  baselineMood: number | null;
  language?: string | null;
};

export type CarePlan = { plan: string; focus: string[] };

function parsePlan(raw: string): CarePlan | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { plan?: unknown; focus?: unknown };
    const plan = typeof parsed.plan === "string" ? parsed.plan.trim() : "";
    const focus = Array.isArray(parsed.focus)
      ? parsed.focus
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().slice(0, 60))
          .filter(Boolean)
          .slice(0, 4)
      : [];
    if (!plan) return null;
    return { plan: plan.slice(0, 2000), focus };
  } catch {
    return null;
  }
}

/** Asks the model for a short starting plan. Returns null on any failure. */
export async function generateCarePlan(input: CarePlanInput): Promise<CarePlan | null> {
  try {
    const facts = [
      input.preferredName ? `Name they go by: ${input.preferredName}` : "",
      input.accountType ? `Account mode: ${input.accountType}` : "",
      input.introText ? `In their own words: "${input.introText}"` : "",
      input.goals.length ? `Goals they picked: ${input.goals.join(", ")}` : "",
      input.stressors.length ? `Stressors they named: ${input.stressors.join(", ")}` : "",
      input.communicationPreference
        ? `How they like to be spoken to: ${input.communicationPreference}`
        : "",
      input.topicsToAvoid ? `Topics to never raise unprompted: ${input.topicsToAvoid}` : "",
      input.inProfessionalCare ? "They are already working with a professional." : "",
      input.baselineMood ? `Baseline mood check-in: ${input.baselineMood}/5` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const payload = await callCompanionModel({
      model: MODEL,
      maxTokens: MAX_TOKENS,
      system: [
        "You write short internal orientation notes for Kalm, a warm mental wellness companion app.",
        "You are NOT writing to the person and NOT writing a treatment plan. You are writing the note the companion reads before every conversation so it already knows who this person is and what would help them.",
        "Absolute rules: never name, imply or infer a mental health condition or diagnosis. Never mention medication. No clinical language, no assessment, no risk rating. Only use what the person actually said.",
        input.language && input.language !== "en"
          ? `Write the note in the language with code "${input.language}".`
          : "",
        "Reply with JSON only, no prose around it, in exactly this shape:",
        '{"plan": "4-6 sentences", "focus": ["short focus area", "short focus area", "short focus area"]}',
        "The plan covers: who they are and what they came for, what tone and pace suits them, 2-3 concrete things worth gently offering over the first weeks (check-ins, a specific kind of exercise, a habit), and anything to steer clear of.",
        "Each focus item is 2-5 words, plain language, e.g. \"Sleep wind-down routine\".",
      ]
        .filter(Boolean)
        .join("\n"),
      messages: [
        {
          role: "user",
          content: `Here is what they told us during onboarding:\n\n${facts || "They shared very little."}`,
        },
      ],
      tools: [],
    });

    const text = (payload.content ?? [])
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    return parsePlan(text);
  } catch (error) {
    console.error("care plan generation failed", error);
    return null;
  }
}

/** Generates and stores the plan on user_profiles. Never throws. */
export async function generateAndStoreCarePlan(
  supabase: Client,
  userId: string,
  input: CarePlanInput,
): Promise<CarePlan | null> {
  const plan = await generateCarePlan(input);
  if (!plan) return null;
  const { error } = await supabase
    .from("user_profiles")
    .update({
      care_plan: plan.plan,
      care_plan_focus: plan.focus,
      care_plan_updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) console.error("care plan save failed", error);
  return plan;
}
