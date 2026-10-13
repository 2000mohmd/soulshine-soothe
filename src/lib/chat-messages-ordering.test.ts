// Crisis-gate-before-rate-limiter guarantee, verified THROUGH the mobile entry
// point: POST /api/v1/chat/messages -> handleChatMessages -> the real
// sendMessageCore (chat.functions.ts). Not the web path.
//
// Same technique as crisis-gate.test.ts: a fake Supabase client that throws the
// moment anything reads `chat_rate_limits`.
//
// Two guarantees:
// - critical → the crisis reply, and the rate limiter is never consulted;
// - high / moderate (regex OR semantic classifier) → the conversation continues
//   normally (no crisis card), but the rate limiter is still never consulted, so
//   a member who has used up their daily messages is never told "limit reached"
//   in answer to a crisis message.

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const touched: string[] = [];
  // Set when the gate marks the saved message flagged_crisis (semantic path).
  const state = { flaggedRow: false, userMessageCount: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- self-referential test stub
  const chain: any = {
    insert: () => chain,
    update: (values: { flagged_crisis?: boolean }) => {
      if (values?.flagged_crisis) state.flaggedRow = true;
      return chain;
    },
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    is: () => chain,
    in: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    delete: () => chain,
    // thread ownership, profiles.language and the post-gate flagged re-read all land here.
    maybeSingle: async () => ({
      data: { id: "thread-1", language: null, flagged_crisis: state.flaggedRow },
      error: null,
    }),
    single: async () => ({
      data: {
        id: "msg-1",
        content: "…",
        flagged_crisis: true,
        created_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    }),
    then: undefined,
    // `{ count }` of a head-count query (the free first-conversation check).
    get count() {
      return state.userMessageCount;
    },
  };
  const fake = {
    touched,
    state,
    from(table: string) {
      touched.push(table);
      if (table === "chat_rate_limits") {
        throw new Error("rate limiter must not run for a crisis message");
      }
      return chain;
    },
    rpc: async () => ({ data: null, error: null }),
  };
  return { touched, state, fake };
});

vi.mock("@/lib/api-auth.server", () => ({
  authenticateBearer: async () => ({ ok: true, userId: "user-1", supabase: h.fake }),
}));

vi.mock("./crisis-alert.server", () => ({
  logCrisisEvent: vi.fn(async () => "event-id"),
}));

const classify = vi.hoisted(() =>
  vi.fn(async () => ({ flagged: false, severity: null, reason: null }) as unknown),
);
vi.mock("./crisis-classifier.server", () => ({ classifyCrisisRisk: classify }));

// The normal (non-crisis-card) path calls the companion model; stub it.
vi.mock("./llm-provider.server", () => ({
  callCompanionModel: vi.fn(async () => ({
    content: [{ type: "text", text: "I'm here with you." }],
    stop_reason: "end_turn",
    usage: { input_tokens: 1, output_tokens: 1 },
  })),
  streamCompanionModel: vi.fn(),
}));

import { handleChatMessages } from "@/routes/api/v1/-handlers";

const THREAD_ID = "11111111-1111-1111-1111-111111111111";

const post = (content: string) =>
  handleChatMessages(
    new Request("https://api.test/api/v1/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer x.y.z" },
      body: JSON.stringify({ thread_id: THREAD_ID, content }),
    }),
  );

beforeEach(() => {
  h.touched.length = 0;
  h.state.flaggedRow = false;
  h.state.userMessageCount = 0;
  classify.mockResolvedValue({ flagged: false, severity: null, reason: null });
});

describe("POST /api/v1/chat/messages — crisis messages never reach the rate limiter", () => {
  it("critical: returns the structured crisis reply", async () => {
    const res = await post("I have the pills ready for tonight");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply.type).toBe("crisis");
    expect(body.reply.severity).toBe("critical");
    expect(body.reply.resources.length).toBeGreaterThan(0);
    expect(body.reply.disclaimer).toBeTruthy();
    expect(h.touched).toContain("chat_messages");
    expect(h.touched).not.toContain("chat_rate_limits");
  });

  for (const [tier, content] of [
    ["high", "I want to kill myself"],
    ["moderate", "I wish I could just disappear forever"],
  ] as const) {
    it(`${tier} (regex): conversation continues, rate limiter untouched`, async () => {
      const res = await post(content);
      expect(res.status).toBe(200);
      expect((await res.json()).reply.type).toBe("message");
      expect(h.touched).not.toContain("chat_rate_limits");
    });
  }

  it("free member past their first conversation: offered the trial, not answered", async () => {
    h.state.userMessageCount = 16; // FREE_INTRO_MESSAGE_CAP is 15
    const res = await post("can we keep talking about my week?");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply.type).toBe("message");
    expect(body.reply.limit).toEqual({
      reason: "intro",
      tier: "free",
      introLimit: 15,
      trialDays: 3,
    });
    expect(h.touched).not.toContain("chat_rate_limits");
  });

  it("free member past their first conversation still gets through with a crisis message", async () => {
    h.state.userMessageCount = 16;
    const body = await (await post("I want to kill myself")).json();
    expect(body.reply.type).toBe("message");
    expect(body.reply.limit).toBeUndefined();
  });

  it("flagged only by the semantic classifier: rate limiter untouched", async () => {
    classify.mockResolvedValue({ flagged: true, severity: "moderate", reason: "test" });
    const res = await post("everything feels pointless lately");
    expect(res.status).toBe(200);
    expect((await res.json()).reply.type).toBe("message");
    expect(h.touched).not.toContain("chat_rate_limits");
  });
});
