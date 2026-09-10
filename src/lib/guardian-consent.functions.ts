// Member-facing guardian-consent state and the "send the request" action.
// Rendered inside the chat screen, never as its own page.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type GuardianConsentState = {
  required: boolean;
  status: "none" | "pending" | "granted" | "withdrawn";
  guardian_email: string | null;
  requested_at: string | null;
  granted_at: string | null;
};

export const getMyGuardianConsent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GuardianConsentState> => {
    const { supabase, userId } = context;

    const profile = await supabase
      .from("profiles")
      .select("guardian_consent_required")
      .eq("id", userId)
      .maybeSingle();
    if (profile.error) throw profile.error;

    const required = Boolean(profile.data?.guardian_consent_required);
    if (!required) {
      return {
        required: false,
        status: "none",
        guardian_email: null,
        requested_at: null,
        granted_at: null,
      };
    }

    const consent = await supabase
      .from("guardian_consents")
      .select("guardian_email, status, requested_at, granted_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (consent.error) throw consent.error;

    return {
      required: true,
      status: (consent.data?.status as GuardianConsentState["status"]) ?? "none",
      guardian_email: consent.data?.guardian_email ?? null,
      requested_at: consent.data?.requested_at ?? null,
      granted_at: consent.data?.granted_at ?? null,
    };
  });

/** Sends (or re-sends) the consent request to the guardian's email. */
export const requestGuardianConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        guardian_email: z.string().trim().email().max(200),
        guardian_name: z.string().trim().max(80).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const profile = await supabase
      .from("profiles")
      .select("preferred_name, guardian_consent_required")
      .eq("id", userId)
      .maybeSingle();
    if (profile.error) throw profile.error;
    if (!profile.data?.guardian_consent_required) {
      throw new Error("Guardian consent is not required for this account.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { newConsentToken, sendGuardianConsentEmail } = await import(
      "./guardian-consent.server"
    );
    const { token, hash } = newConsentToken();

    const saved = await supabaseAdmin.from("guardian_consents").upsert(
      {
        user_id: userId,
        guardian_email: data.guardian_email,
        guardian_name: data.guardian_name ?? null,
        status: "pending",
        token_hash: hash,
        requested_at: new Date().toISOString(),
        granted_at: null,
        withdrawn_at: null,
      },
      { onConflict: "user_id" },
    );
    if (saved.error) throw saved.error;

    const emailed = await sendGuardianConsentEmail({
      guardianEmail: data.guardian_email,
      guardianName: data.guardian_name ?? null,
      teenName: profile.data.preferred_name ?? null,
      token,
    });

    return { ok: true, emailed };
  });
