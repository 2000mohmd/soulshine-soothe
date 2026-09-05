import { beforeEach, describe, expect, it, vi } from "vitest";

// Configurable fake Supabase client (same shape as -handlers.phase2.test.ts,
// plus `upsert` and captured `updates`).
const h = vi.hoisted(() => {
  const state: {
    tables: Record<string, { maybeSingle?: unknown; single?: unknown; rows?: unknown[] }>;
    writes: { op: string; table: string; row: unknown }[];
    authOk: boolean;
  } = { tables: {}, writes: [], authOk: true };

  function chainFor(table: string) {
    const cfg = () => state.tables[table] ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- self-referential test stub
    const chain: any = {
      insert(row: unknown) {
        state.writes.push({ op: "insert", table, row });
        return chain;
      },
      update(row: unknown) {
        state.writes.push({ op: "update", table, row });
        return chain;
      },
      upsert(row: unknown) {
        state.writes.push({ op: "upsert", table, row });
        return chain;
      },
      delete: () => chain,
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      lt: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: cfg().maybeSingle ?? null, error: null }),
      single: async () => ({ data: cfg().single ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: cfg().rows ?? [], error: null }).then(resolve),
    };
    return chain;
  }

  return { state, fake: { from: (t: string) => chainFor(t) } };
});

vi.mock("@/lib/api-auth.server", () => ({
  authenticateBearer: async () =>
    h.state.authOk
      ? { ok: true, userId: "user-1", supabase: h.fake }
      : { ok: false, status: 401, error: "Invalid or expired token" },
}));

// The welcome-message step is best-effort and calls an LLM — stub it.
vi.mock("@/lib/companion-reaction.server", () => ({
  generateReaction: vi.fn(async () => ""),
  resolveActiveThread: vi.fn(async () => null),
}));

import { handleOnboarding } from "./-handlers";

const YEAR = new Date().getUTCFullYear();
const dobForAge = (age: number) => `${YEAR - age}-01-01`;

const base = {
  preferred_name: "Sam",
  account_type: "general",
  privacy_consent: true,
  ai_context_consent: true,
  baseline_mood: 3,
};

const post = (body: unknown) =>
  handleOnboarding(
    new Request("https://api.test/api/v1/onboarding", {
      method: "POST",
      headers: { Authorization: "Bearer x.y.z", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

// The profile write is an upsert (a plain update matched zero rows for accounts
// with no profiles row yet, which silently failed onboarding).
const profileUpdate = () =>
  h.state.writes.find((w) => w.op === "upsert" && w.table === "profiles")?.row as
    Record<string, unknown> | undefined;


beforeEach(() => {
  h.state.tables = { chat_threads: { single: { id: "thr-1" } } };
  h.state.writes = [];
  h.state.authOk = true;
});

describe("handleOnboarding", () => {
  it("completes for an adult and computes age server-side (no client age flag)", async () => {
    const res = await post({ ...base, date_of_birth: dobForAge(30) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const row = profileUpdate();
    expect(row).toBeTruthy();
    expect(row!["account_type"]).toBe("general");
    expect(row!["date_of_birth"]).toBe(dobForAge(30));
    expect(row!["age_confirmed_13_plus"]).toBe(true);
    expect(row!["onboarding_completed"]).toBe(true);
  });

  it("forces account_type to 'teen' for a minor regardless of what was sent", async () => {
    const res = await post({ ...base, account_type: "general", date_of_birth: dobForAge(15) });
    expect(res.status).toBe(200);
    expect(profileUpdate()!["account_type"]).toBe("teen");
  });

  it("rejects an under-13 date of birth with 400", async () => {
    const res = await post({ ...base, date_of_birth: dobForAge(9) });
    expect(res.status).toBe(400);
    expect(profileUpdate()).toBeUndefined();
  });

  it("400s on a malformed body (missing preferred_name)", async () => {
    const { preferred_name: _omit, ...noName } = base;
    const res = await post({ ...noName, date_of_birth: dobForAge(30) });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid date_of_birth format", async () => {
    const res = await post({ ...base, date_of_birth: "01/01/2000" });
    expect(res.status).toBe(400);
  });

  it("401s without a valid bearer token", async () => {
    h.state.authOk = false;
    const res = await post({ ...base, date_of_birth: dobForAge(30) });
    expect(res.status).toBe(401);
    expect(h.state.writes).toHaveLength(0);
  });
});
