import type { Page } from "@playwright/test";

// Signs the throwaway test account in over the Supabase auth API instead of the
// /auth form. The UI is magic-link + OAuth only, which a test can't click
// through, but the account itself can still have a password (set once by an
// admin — see e2e/README.md). One session per worker, reused by both the
// browser specs (injected into localStorage, where the web client reads it on
// localhost) and the API specs (as a bearer token).

const EMAIL = process.env["E2E_EMAIL"];
const PASSWORD = process.env["E2E_PASSWORD"];
const SUPABASE_URL = process.env["VITE_SUPABASE_URL"];
const SUPABASE_KEY = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

export const hasTestAccount = Boolean(EMAIL && PASSWORD && SUPABASE_URL && SUPABASE_KEY);
export const NO_ACCOUNT_REASON =
  "set E2E_EMAIL / E2E_PASSWORD (an onboarded throwaway account) to run signed-in specs";

type Session = { access_token: string; refresh_token: string; user: { id: string } };

let cached: Promise<Session> | undefined;

export function getSession(): Promise<Session> {
  cached ??= (async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (!res.ok) throw new Error(`E2E sign-in failed (${res.status}): ${await res.text()}`);
    return (await res.json()) as Session;
  })();
  return cached;
}

/** Puts the session where supabase-js looks for it before any page script runs. */
export async function signIn(page: Page) {
  const session = await getSession();
  const storageKey = `sb-${new URL(SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    storageKey,
    JSON.stringify(session),
  ] as const);
}

export async function authHeaders() {
  return { Authorization: `Bearer ${(await getSession()).access_token}` };
}
