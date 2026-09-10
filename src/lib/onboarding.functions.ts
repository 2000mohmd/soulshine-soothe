import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MINOR_AGE, MIN_AGE, ageFromDateOfBirth } from "./age";

const AccountType = z.enum(["general", "condition", "teen", "org_member"]);

const OnboardingInput = z.object({
  preferred_name: z.string().trim().min(1).max(60),
  account_type: AccountType,
  privacy_consent: z.literal(true),
  ai_context_consent: z.boolean(),
  // Real DOB (YYYY-MM-DD). The server computes age from this — it is the
  // authority for age_confirmed_13_plus and the teen lock.
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  // Only used when the computed age is under 18: where the consent request goes.
  guardian_email: z.string().trim().email().max(200).nullish(),
  guardian_name: z.string().trim().max(80).nullish(),
  intro_text: z.string().trim().max(2000).optional().default(""),
  goals: z.array(z.string().trim().max(80)).max(12).default([]),
  stressors: z.array(z.string().trim().max(80)).max(12).default([]),
  existing_diagnosis: z.string().trim().max(200).optional().default(""),
  communication_preference: z.string().trim().max(120).optional().default(""),
  topics_to_avoid: z.string().trim().max(500).optional().default(""),
  in_professional_care: z.boolean().default(false),
  baseline_mood: z.number().int().min(1).max(5),
  baseline_tags: z.array(z.string().trim().max(40)).max(10).default([]),
});

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [profile, intro, moods] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("mood_logs")
        .select("id, score, note, tags, logged_at, is_baseline")
        .eq("user_id", userId)
        .order("logged_at", { ascending: false })
        .limit(7),
    ]);

    if (profile.error) throw profile.error;

    return {
      profile: profile.data,
      intro: intro.data,
      recentMoods: moods.data ?? [],
    };
  });

/**
 * Onboarding, decoupled from transport. The web RPC (`completeOnboarding` below)
 * and the mobile route (POST /api/v1/onboarding) both call this with an already-
 * authenticated client + userId. Age is computed here, server-side — the client
 * only supplies `date_of_birth`; there is no `age_confirmed_13_plus` input.
 */
export async function completeOnboardingCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
) {
  const data = OnboardingInput.parse(input);

  {
    // Age is computed here, server-side — not trusted from the client.
    const age = ageFromDateOfBirth(data.date_of_birth);
    if (age === null) throw new Error("Invalid date of birth");
    if (age < MIN_AGE) {
      throw new Error(`Kalm is for people aged ${MIN_AGE} and over.`);
    }
    // Under 18 is locked to teen mode regardless of what the client selected.
    const resolvedAccountType = age < MINOR_AGE ? "teen" : data.account_type;

    // Upsert, not update: a freshly signed-up account may not have a profiles
    // row yet, and an UPDATE matching zero rows silently left
    // onboarding_completed false — which bounced the person back to step 1.
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: userId,
        preferred_name: data.preferred_name,
        account_type: resolvedAccountType,
        privacy_consent: data.privacy_consent,
        ai_context_consent: data.ai_context_consent,
        // date_of_birth is added by migration 20260902000200; not in the
        // generated Database types until Lovable regenerates them.
        date_of_birth: data.date_of_birth,
        age_confirmed_13_plus: age >= MIN_AGE,
        consent_accepted_at: new Date().toISOString(),
        onboarding_completed: true,
      } as never, { onConflict: "id" });
    if (profileError) throw profileError;

    const { error: introError } = await supabase.from("user_profiles").upsert(
      {
        user_id: userId,
        intro_text: data.intro_text || null,
        goals: data.goals,
        stressors: data.stressors,
        existing_diagnosis: data.existing_diagnosis || null,
        communication_preference: data.communication_preference || null,
        topics_to_avoid: data.topics_to_avoid || null,
        in_professional_care: data.in_professional_care,
      },
      { onConflict: "user_id" },
    );
    if (introError) throw introError;

    const { error: moodError } = await supabase.from("mood_logs").insert({
      user_id: userId,
      score: data.baseline_mood,
      tags: data.baseline_tags,
      is_baseline: true,
    });
    if (moodError) throw moodError;

    // The AI writes a short orientation plan from what they just told us, so
    // chat, nudges, calls and reactions all start out knowing who they are.
    let carePlan: string | null = null;
    let carePlanFocus: string[] = [];
    try {
      const { generateAndStoreCarePlan } = await import("./care-plan.server");
      const language = (
        await supabase.from("profiles").select("language").eq("id", userId).maybeSingle()
      ).data?.language;
      const generated = await generateAndStoreCarePlan(supabase, userId, {
        preferredName: data.preferred_name,
        accountType: resolvedAccountType,
        introText: data.intro_text || null,
        goals: data.goals,
        stressors: data.stressors,
        communicationPreference: data.communication_preference || null,
        topicsToAvoid: data.topics_to_avoid || null,
        inProfessionalCare: data.in_professional_care,
        baselineMood: data.baseline_mood,
        language: language ?? "en",
      });
      carePlan = generated?.plan ?? null;
      carePlanFocus = generated?.focus ?? [];
    } catch (error) {
      console.error("care plan step failed", error);
    }

    // The companion opens the conversation rather than dropping the person into
    // an empty chat: one warm, personal message waiting for them on /chat.
    try {
      const { generateReaction, resolveActiveThread } = await import("./companion-reaction.server");
      const created = await supabase
        .from("chat_threads")
        .insert({ user_id: userId, title: "Getting started" })
        .select("id")
        .single();
      const threadId = created.data?.id ?? (await resolveActiveThread(supabase, userId));
      if (threadId) {
        const opening = await generateReaction(
          [
            `${data.preferred_name} has just finished setting up their Kalm profile. This is the very first message in the conversation and they haven't written anything yet — you are opening it.`,
            data.intro_text ? `In their own words: "${data.intro_text}"` : "",
            data.goals.length ? `Goals they picked: ${data.goals.join(", ")}.` : "",
            data.stressors.length ? `Stressors they named: ${data.stressors.join(", ")}.` : "",
            "Write 3-4 short sentences: welcome them by name, reference one specific thing they told you (a goal or a stressor) so it's clear you read it, briefly mention in one sentence that check-ins, exercises and just talking things through are all possible here (not a feature list), and end with one genuine, easy question.",
          ]
            .filter(Boolean)
            .join(" "),
          {
            preferredName: data.preferred_name,
            accountType: resolvedAccountType,
            introText: data.intro_text || null,
            goals: data.goals,
            stressors: data.stressors,
            communicationPreference: data.communication_preference || null,
            topicsToAvoid: data.topics_to_avoid || null,
            inProfessionalCare: data.in_professional_care,
            carePlan,
          },
        );
        if (opening) {
          const saved = await supabase.from("chat_messages").insert({
            thread_id: threadId,
            user_id: userId,
            sender: "assistant",
            content_type: "text",
            content: opening,
          });
          if (saved.error) console.error("welcome message insert failed", saved.error);
          await supabase
            .from("chat_threads")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", threadId);
        }
      }
    } catch (error) {
      console.error("welcome message generation failed", error);
    }

    return { ok: true, care_plan: carePlan, care_plan_focus: carePlanFocus };
  }
}

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OnboardingInput.parse(input))
  .handler(({ data, context }) => completeOnboardingCore(context.supabase, context.userId, data));

/**
 * Proactive-email opt-out (Phase 2). One boolean; the full per-type preferences
 * screen comes later. `email_opt_out` is added by migration
 * 20260902000400 and not yet in the generated types.
 */
export const setEmailOptOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ opt_out: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ email_opt_out: data.opt_out } as never)
      .eq("id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("mood_logs").delete().eq("user_id", userId);
    await supabase
      .from("user_profiles")
      .update({
        intro_text: null,
        goals: [],
        stressors: [],
        existing_diagnosis: null,
        communication_preference: null,
        topics_to_avoid: null,
      })
      .eq("user_id", userId);
    return { ok: true };
  });

/**
 * Full account deletion (item 5) — distinct from deleteMyData, which only wipes
 * wellness data and keeps the account. This removes the person entirely.
 *
 * The actual work is in account-deletion.server.ts's deleteAccountCore, shared
 * with the mobile DELETE /api/v1/account route so both delete paths (and any
 * future Stripe/RPC changes) stay identical.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteAccountCore } = await import("./account-deletion.server");
    await deleteAccountCore(supabaseAdmin, userId);
    return { ok: true };
  });
