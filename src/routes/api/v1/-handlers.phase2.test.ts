import { beforeEach, describe, expect, it, vi } from "vitest";

// Configurable fake Supabase client. Per-test, set `h.state.tables[<name>]` with
// `{ maybeSingle?, single?, rows? }`; anything unset returns null / [].
const h = vi.hoisted(() => {
  const state: {
    tables: Record<string, { maybeSingle?: unknown; single?: unknown; rows?: unknown[] }>;
    inserted: { table: string; row: unknown }[];
    authOk: boolean;
  } = { tables: {}, inserted: [], authOk: true };

  function chainFor(table: string) {
    const cfg = () => state.tables[table] ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- self-referential test stub
    const chain: any = {
      insert(row: unknown) {
        state.inserted.push({ table, row });
        return chain;
      },
      update: () => chain,
      delete: () => chain,
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      lt: () => chain,
      gt: () => chain,
      gte: () => chain,
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

const logCrisisEvent = vi.fn((..._args: unknown[]) => Promise.resolve("evt-1"));
vi.mock("@/lib/crisis-alert.server", () => ({
  logCrisisEvent: (...args: unknown[]) => logCrisisEvent(...args),
}));

// Non-crisis screener submissions post a warm activity card to chat via an LLM
// call — stub it so the tests stay offline and fast.
vi.mock("@/lib/companion-reaction.server", () => ({
  postActivityToChat: vi.fn(async () => {}),
  generateReaction: vi.fn(async () => ""),
  resolveActiveThread: vi.fn(async () => null),
}));

import {
  handleChatThreadMessages,
  handleChatThreads,
  handleEntitlements,
  handleScreenerResponses,
} from "./-handlers";

const req = (path: string, init: RequestInit = {}) =>
  new Request(`https://api.test${path}`, {
    headers: { Authorization: "Bearer x.y.z", "content-type": "application/json" },
    ...init,
  });

beforeEach(() => {
  h.state.tables = {};
  h.state.inserted = [];
  h.state.authOk = true;
  logCrisisEvent.mockClear();
});

// --- POST /api/v1/screeners/:type/responses ---------------------------------

describe("handleScreenerResponses", () => {
  const submit = (type: string, responses: number[]) =>
    handleScreenerResponses(
      req(`/api/v1/screeners/${type}/responses`, {
        method: "POST",
        body: JSON.stringify({ responses }),
      }),
      type,
    );

  beforeEach(() => {
    h.state.tables["screener_responses"] = {
      single: { id: "sr-1", total_score: 4, severity: "mild", taken_at: "2026-01-01T00:00:00Z" },
      rows: [],
    };
    h.state.tables["profiles"] = { maybeSingle: { preferred_name: "Sam" } };
  });

  it("PHQ-9 item 9 >= 1 triggers the crisis pathway through this endpoint", async () => {
    const res = await submit("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 2]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.crisisTriggered).toBe(true);
    expect(body.crisis).not.toBeNull();
    expect(body.crisis.type).toBe("crisis");
    expect(body.crisis.severity).toBe("high"); // item9 === 2 -> high
    expect(body.crisis.resources.length).toBeGreaterThan(0);
    expect(body.crisis.disclaimer).toBeTruthy();
    expect(logCrisisEvent).toHaveBeenCalledTimes(1);
  });

  it("PHQ-9 item 9 === 1 escalates at moderate severity", async () => {
    const body = await (await submit("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 1])).json();
    expect(body.crisisTriggered).toBe(true);
    expect(body.crisis.severity).toBe("moderate");
  });

  it("PHQ-9 with item 9 === 0 does not trigger crisis", async () => {
    const body = await (await submit("phq9", [2, 2, 2, 1, 0, 0, 0, 0, 0])).json();
    expect(body.crisisTriggered).toBe(false);
    expect(body.crisis).toBeNull();
    expect(logCrisisEvent).not.toHaveBeenCalled();
  });

  it("GAD-7 (7 responses) is accepted and never hits the item-9 path", async () => {
    const body = await (await submit("gad7", [1, 1, 1, 1, 1, 1, 1])).json();
    expect(body.crisisTriggered).toBe(false);
  });

  it("400s for an unknown screener type", async () => {
    expect((await submit("phq99", [0, 0, 0, 0, 0, 0, 0])).status).toBe(400);
  });

  it("400s for the wrong number of responses", async () => {
    expect((await submit("phq9", [0, 0, 0])).status).toBe(400);
  });

  it("401s when the bearer token is invalid", async () => {
    h.state.authOk = false;
    expect((await submit("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 2])).status).toBe(401);
    expect(logCrisisEvent).not.toHaveBeenCalled();
  });
});

// --- GET /api/v1/entitlements ---------------------------------------------------

describe("handleEntitlements", () => {
  it("reports the free daily cap (8) as the single source of truth, no usage yet", async () => {
    const body = await (await handleEntitlements(req("/api/v1/entitlements"))).json();
    expect(body.tier).toBe("free");
    expect(body.chat.unlimited).toBe(false);
    expect(body.chat.dailyLimit).toBe(8);
    expect(body.chat.dailyCredits).toBe(8);
    expect(body.chat.usedToday).toBe(0);
    expect(body.chat.remainingToday).toBe(8);
    expect(typeof body.chat.resetsAt).toBe("string");
  });

  it("derives usedToday / remainingToday from chat_rate_limits.day_count (the enforced counter)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    h.state.tables["chat_rate_limits"] = { maybeSingle: { day_start: today, day_count: 3 } };
    const body = await (await handleEntitlements(req("/api/v1/entitlements"))).json();
    expect(body.chat.usedToday).toBe(3);
    expect(body.chat.remainingToday).toBe(5);
  });

  it("ignores a stale day_count from a previous UTC day", async () => {
    h.state.tables["chat_rate_limits"] = {
      maybeSingle: { day_start: "2000-01-01", day_count: 99 },
    };
    const body = await (await handleEntitlements(req("/api/v1/entitlements"))).json();
    expect(body.chat.usedToday).toBe(0);
    expect(body.chat.remainingToday).toBe(8);
  });

  it("reports pro as unlimited-ish with the 200/day cap and one weekly call", async () => {
    h.state.tables["profiles"] = { maybeSingle: { subscription_tier: "pro" } };
    const body = await (await handleEntitlements(req("/api/v1/entitlements"))).json();
    expect(body.tier).toBe("pro");
    expect(body.chat.unlimited).toBe(true);
    expect(body.chat.dailyLimit).toBe(200);
    expect(body.voice.weeklyLimit).toBe(1);
  });

  it("reports premium as unlimited-ish with the 500/day ceiling and two weekly calls", async () => {
    h.state.tables["profiles"] = { maybeSingle: { subscription_tier: "premium" } };
    const body = await (await handleEntitlements(req("/api/v1/entitlements"))).json();
    expect(body.tier).toBe("premium");
    expect(body.chat.unlimited).toBe(true);
    expect(body.chat.dailyLimit).toBe(500);
    expect(body.chat.remainingToday).toBeNull();
    expect(body.voice.weeklyLimit).toBe(2);
    expect(body.voice.enabled).toBe(true);
  });

  it("gives free tier no voice access", async () => {
    const body = await (await handleEntitlements(req("/api/v1/entitlements"))).json();
    expect(body.voice.enabled).toBe(false);
    expect(body.voice.weeklyLimit).toBe(0);
  });


  it("401s without a valid token", async () => {
    h.state.authOk = false;
    expect((await handleEntitlements(req("/api/v1/entitlements"))).status).toBe(401);
  });
});

// --- GET /api/v1/chat/threads[/:id/messages] ---------------------------------

describe("handleChatThreads", () => {
  it("returns the caller's threads", async () => {
    h.state.tables["chat_threads"] = {
      rows: [{ id: "t-1", title: "hi", created_at: "", updated_at: "" }],
    };
    const body = await (await handleChatThreads(req("/api/v1/chat/threads"))).json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe("t-1");
  });
});

describe("handleChatThreadMessages", () => {
  const ID = "11111111-1111-1111-1111-111111111111";

  it("404s when the thread is not owned by the caller", async () => {
    h.state.tables["chat_threads"] = { maybeSingle: null };
    const res = await handleChatThreadMessages(req(`/api/v1/chat/threads/${ID}/messages`), ID);
    expect(res.status).toBe(404);
  });

  it("returns a page ascending with a nextBefore cursor when more remain", async () => {
    h.state.tables["chat_threads"] = {
      maybeSingle: { id: ID, title: "t", created_at: "", updated_at: "" },
    };
    // limit=2 -> core asks for 3; 3 rows back means hasMore
    h.state.tables["chat_messages"] = {
      rows: [
        { id: "m3", created_at: "2026-01-03T00:00:00Z", sender: "user", content: "c" },
        { id: "m2", created_at: "2026-01-02T00:00:00Z", sender: "user", content: "b" },
        { id: "m1", created_at: "2026-01-01T00:00:00Z", sender: "user", content: "a" },
      ],
    };
    const body = await (
      await handleChatThreadMessages(req(`/api/v1/chat/threads/${ID}/messages?limit=2`), ID)
    ).json();
    expect(body.messages.map((m: { id: string }) => m.id)).toEqual(["m2", "m3"]); // ascending
    expect(body.nextBefore).toBe("2026-01-02T00:00:00Z");
  });

  it("400s for a non-uuid thread id", async () => {
    const res = await handleChatThreadMessages(req("/api/v1/chat/threads/nope/messages"), "nope");
    expect(res.status).toBe(400);
  });
});
