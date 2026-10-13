// The paid human coach: a NEW request needs a paid plan past its trial; an
// already-open conversation is never cut off; the API answers 402.
import { describe, expect, it, vi } from "vitest";
import { COACH_PAID_ONLY, requestHumanSupportCore } from "./human-handoff.functions";
import { handle } from "@/routes/api/v1/-shared";

vi.mock("./human-handoff.server", () => ({
  summarizeForHuman: vi.fn(async () => null),
  sendHandoffAlertEmail: vi.fn(async () => false),
}));

function fakeSupabase(opts: { open: unknown; profile: Record<string, unknown> }) {
  const inserted: string[] = [];
  const from = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- self-referential test stub
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      update: () => chain,
      insert: () => {
        inserted.push(table);
        return chain;
      },
      maybeSingle: async () => ({
        data:
          table === "human_support_requests"
            ? opts.open
            : table === "profiles"
              ? opts.profile
              : null,
        error: null,
      }),
      single: async () => ({
        data: { id: "req-1", status: "queued", created_at: "2026-01-01T00:00:00Z" },
        error: null,
      }),
    };
    return chain;
  };
  return { client: { from } as never, inserted };
}

const ask = (open: unknown, profile: Record<string, unknown>) => {
  const { client, inserted } = fakeSupabase({ open, profile });
  return { run: requestHumanSupportCore(client, "user-1", { note: "hi" }), inserted };
};

describe("human coach access", () => {
  it("free members cannot open a request", async () => {
    await expect(ask(null, { subscription_tier: "free" }).run).rejects.toThrow(COACH_PAID_ONLY);
  });

  it("trialing members cannot open a request yet", async () => {
    const { run, inserted } = ask(null, {
      subscription_tier: "pro",
      stripe_subscription_status: "trialing",
    });
    await expect(run).rejects.toThrow(COACH_PAID_ONLY);
    expect(inserted).not.toContain("human_support_requests");
  });

  it("charged pro / premium / org members can", async () => {
    for (const profile of [
      { subscription_tier: "pro", stripe_subscription_status: "active" },
      { subscription_tier: "premium", stripe_subscription_status: "active" },
      { subscription_tier: "org", stripe_subscription_status: null },
    ]) {
      const { run, inserted } = ask(null, profile);
      expect((await run).already_open).toBe(false);
      expect(inserted).toContain("human_support_requests");
    }
  });

  it("an already-open conversation can always continue, plan or not", async () => {
    const open = { id: "req-9", status: "claimed", created_at: "2026-01-01T00:00:00Z" };
    const result = await ask(open, { subscription_tier: "free" }).run;
    expect(result).toMatchObject({ request_id: "req-9", already_open: true });
  });

  it("the API answers 402 Payment Required", async () => {
    const res = await handle(async () => {
      throw new Error(COACH_PAID_ONLY);
    });
    expect(res.status).toBe(402);
  });
});
