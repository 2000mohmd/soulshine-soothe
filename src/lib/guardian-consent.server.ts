// Parental/guardian consent for members aged 13-17.
//
// A teen account is created as normal but held in a waiting state until a
// guardian approves through a one-time signed link sent to their email. Crisis
// resources are NEVER gated by this — only the companion (chat replies, voice
// calls) is held back.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

const RESEND_URL = "https://api.resend.com/emails";
const FROM = "Kalm <onboarding@resend.dev>";

export function appBaseUrl(): string {
  return (
    process.env["APP_BASE_URL"] ??
    process.env["VITE_APP_BASE_URL"] ??
    "https://soulshine-soothe.lovable.app"
  );
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newConsentToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashToken(token) };
}

function consentLink(token: string, action: "approve" | "withdraw"): string {
  return `${appBaseUrl()}/api/public/guardian-consent?token=${token}&action=${action}`;
}

/** Sends the guardian the plain-language consent request. */
export async function sendGuardianConsentEmail(input: {
  guardianEmail: string;
  guardianName: string | null;
  teenName: string | null;
  token: string;
}): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    console.error("[guardian] consent email skipped: RESEND_API_KEY missing");
    return false;
  }

  const who = input.teenName ? input.teenName : "A teenager in your care";
  const text = [
    input.guardianName ? `Hello ${input.guardianName},` : "Hello,",
    "",
    `${who} has signed up for Kalm and needs your permission before they can use it.`,
    "",
    "What Kalm is: a wellness companion app. It offers guided exercises, mood check-ins, and conversations with an AI companion.",
    "What Kalm is not: it is not a therapist, not a doctor, and not an emergency service. It does not diagnose or treat anything.",
    "If it detects that someone may be in danger, it stops the conversation, shows real crisis helplines, and alerts our safety team.",
    "",
    "What we keep: their name, their age, what they choose to write in check-ins and conversations, and how they use the app. We do not sell their data. They can delete their account and data at any time from the app.",
    "",
    `Give permission: ${consentLink(input.token, "approve")}`,
    "",
    `Withdraw permission at any time (same link, works later too): ${consentLink(input.token, "withdraw")}`,
    "",
    "Until you approve, their account can only show crisis helplines — the AI companion stays switched off.",
    "",
    "If you did not expect this email, you can simply ignore it and nothing will be enabled.",
  ].join("\n");

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: FROM,
        to: [input.guardianEmail],
        subject: "Your permission is needed — Kalm",
        text,
      }),
    });
    if (!response.ok) {
      console.error(
        `[guardian] consent email failed [${response.status}]: ${await response.text()}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("[guardian] consent email threw", error);
    return false;
  }
}

/**
 * Teens can't pay themselves: their checkout link goes to the guardian on file.
 * Stripe Checkout links expire after 24 hours; the teen can send a fresh one.
 */
export async function sendGuardianPaymentEmail(input: {
  guardianEmail: string;
  guardianName: string | null;
  teenName: string | null;
  planName: string;
  trialDays: number;
  checkoutUrl: string;
}): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    console.error("[guardian] payment email skipped: RESEND_API_KEY missing");
    return false;
  }

  const who = input.teenName ? input.teenName : "The teenager in your care";
  const text = [
    input.guardianName ? `Hello ${input.guardianName},` : "Hello,",
    "",
    `${who} would like to continue using Kalm on the ${input.planName} plan, and asked us to send you the payment link.`,
    "",
    input.trialDays > 0
      ? `It starts with a ${input.trialDays}-day free trial: your card is not charged during the trial, and you can cancel any time before it ends at no cost.`
      : "You can cancel the subscription at any time.",
    "",
    `Set up the plan: ${input.checkoutUrl}`,
    "",
    "This link works for 24 hours. If it has expired, they can send you a new one from the app.",
    "",
    "Kalm is a wellness companion, not a therapist, doctor or emergency service. Crisis help lines are always free in the app, with or without a plan.",
    "",
    "If you did not expect this email, you can simply ignore it — nothing is charged unless you complete the payment page.",
  ].join("\n");

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: FROM,
        to: [input.guardianEmail],
        subject: "Payment link for Kalm",
        text,
      }),
    });
    if (!response.ok) {
      console.error(
        `[guardian] payment email failed [${response.status}]: ${await response.text()}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("[guardian] payment email threw", error);
    return false;
  }
}

export type ConsentActionResult =
  { ok: true; action: "approve" | "withdraw" } | { ok: false; reason: "invalid" };

/**
 * Applies the guardian's decision from the emailed link. Uses the service-role
 * client because the guardian has no account here.
 */
export async function applyGuardianDecision(
  admin: Client,
  input: {
    token: string;
    action: "approve" | "withdraw";
    ip: string | null;
    userAgent: string | null;
  },
): Promise<ConsentActionResult> {
  const hash = hashToken(input.token);
  const consent = await admin
    .from("guardian_consents")
    .select("user_id, status")
    .eq("token_hash", hash)
    .maybeSingle();
  if (consent.error) {
    console.error("[guardian] lookup failed", consent.error);
    return { ok: false, reason: "invalid" };
  }
  if (!consent.data) return { ok: false, reason: "invalid" };

  const now = new Date().toISOString();
  const patch =
    input.action === "approve"
      ? {
          status: "granted",
          granted_at: now,
          withdrawn_at: null,
          consent_ip: input.ip,
          consent_user_agent: input.userAgent,
        }
      : { status: "withdrawn", withdrawn_at: now };

  const updated = await admin
    .from("guardian_consents")
    .update(patch as never)
    .eq("user_id", consent.data.user_id);
  if (updated.error) {
    console.error("[guardian] update failed", updated.error);
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, action: input.action };
}

/** True when this account is allowed to talk to the companion. */
export async function companionAllowed(
  supabase: Client,
  userId: string,
): Promise<{ allowed: boolean; reason: "ok" | "awaiting_guardian_consent" }> {
  const profile = await supabase
    .from("profiles")
    .select("guardian_consent_required")
    .eq("id", userId)
    .maybeSingle();
  if (!profile.data?.guardian_consent_required) return { allowed: true, reason: "ok" };

  const consent = await supabase
    .from("guardian_consents")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (consent.data?.status === "granted") return { allowed: true, reason: "ok" };
  return { allowed: false, reason: "awaiting_guardian_consent" };
}
