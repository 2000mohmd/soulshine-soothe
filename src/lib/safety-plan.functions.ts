// The member's personal safety plan: their own words about what warning signs
// look like, what helps, who they can reach, and why they want to stay.
//
// This is member-owned content, never generated for them and never clinical.
// It lives entirely inside the chat screen (a slide-over panel) — there is no
// separate page.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const SAFETY_PLAN_SECTIONS = [
  "warning_signs",
  "coping_steps",
  "people",
  "professionals",
  "safer_space",
  "reasons_to_stay",
] as const;

export type SafetyPlanSection = (typeof SAFETY_PLAN_SECTIONS)[number];

export type SafetyPlan = {
  warning_signs: string[];
  coping_steps: string[];
  people: string[];
  professionals: string[];
  safer_space: string[];
  reasons_to_stay: string[];
  notes: string | null;
  updated_at: string | null;
};

const EMPTY: SafetyPlan = {
  warning_signs: [],
  coping_steps: [],
  people: [],
  professionals: [],
  safer_space: [],
  reasons_to_stay: [],
  notes: null,
  updated_at: null,
};

const line = z.string().trim().max(240);
const list = z.array(line).max(20).default([]);

const PlanInput = z.object({
  warning_signs: list,
  coping_steps: list,
  people: list,
  professionals: list,
  safer_space: list,
  reasons_to_stay: list,
  notes: z.string().trim().max(2000).nullish(),
});

/** True when the person has written anything at all. */
export function hasSafetyPlanContent(plan: SafetyPlan | null | undefined): boolean {
  if (!plan) return false;
  return (
    SAFETY_PLAN_SECTIONS.some((section) => plan[section].length > 0) ||
    Boolean(plan.notes && plan.notes.trim())
  );
}

export const getMySafetyPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ plan: SafetyPlan; exists: boolean }> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("safety_plans")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { plan: EMPTY, exists: false };

    const plan: SafetyPlan = {
      warning_signs: data.warning_signs ?? [],
      coping_steps: data.coping_steps ?? [],
      people: data.people ?? [],
      professionals: data.professionals ?? [],
      safer_space: data.safer_space ?? [],
      reasons_to_stay: data.reasons_to_stay ?? [],
      notes: data.notes ?? null,
      updated_at: data.updated_at ?? null,
    };
    return { plan, exists: hasSafetyPlanContent(plan) };
  });

export const saveMySafetyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PlanInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const clean = (values: string[]) => values.map((value) => value.trim()).filter(Boolean);

    const { error } = await supabase.from("safety_plans").upsert(
      {
        user_id: userId,
        warning_signs: clean(data.warning_signs),
        coping_steps: clean(data.coping_steps),
        people: clean(data.people),
        professionals: clean(data.professionals),
        safer_space: clean(data.safer_space),
        reasons_to_stay: clean(data.reasons_to_stay),
        notes: data.notes?.trim() || null,
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    return { ok: true };
  });
