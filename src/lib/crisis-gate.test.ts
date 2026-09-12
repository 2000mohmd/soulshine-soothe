import { describe, expect, it, vi } from "vitest";
import { triageCrisis, severityRank, crisisCopy, buildCrisisResponse } from "./crisis";
import { runCrisisGate } from "./crisis-gate.server";

const hasUsLines = (resources: { contact: string }[]) =>
  resources.some((r) => r.contact.includes("988") || r.contact.includes("741741"));

vi.mock("./crisis-alert.server", () => ({
  logCrisisEvent: vi.fn(async () => "event-id"),
}));

vi.mock("./crisis-classifier.server", () => ({
  classifyCrisisRisk: vi.fn(async () => ({ flagged: false, severity: null, reason: null })),
}));

/**
 * Fake client that throws if anything touches the rate-limit table, so the
 * ordering guarantee is enforced by the test rather than by convention.
 */
function fakeSupabase() {
  const touched: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- self-referential test stub
  const chain: any = {
    insert: () => chain,
    update: () => chain,
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({
      data: { id: "sys-1", created_at: "2026-01-01T00:00:00Z" },
      error: null,
    }),
    then: undefined,
  };
  return {
    touched,
    from(table: string) {
      touched.push(table);
      if (table === "chat_rate_limits") {
        throw new Error("rate limiter must not run before the crisis gate");
      }
      return chain;
    },
  };
}

describe("triageCrisis severity tiers", () => {
  it("returns critical for imminent-plan language", () => {
    const result = triageCrisis("I have the pills ready for tonight");
    expect(result.severity).toBe("critical");
    expect(result.matched.length).toBeGreaterThan(0);
  });

  it("returns high for explicit self-harm intent", () => {
    expect(triageCrisis("I want to kill myself").severity).toBe("high");
  });

  it("returns moderate for passive ideation", () => {
    expect(triageCrisis("I wish I could just disappear forever").severity).toBe("moderate");
  });

  it("returns no severity for ordinary distress", () => {
    const result = triageCrisis("work has been really stressful and I slept badly");
    expect(result.severity).toBeNull();
    expect(result.matched).toEqual([]);
  });

  it("ranks critical above high above moderate", () => {
    expect(severityRank("critical")).toBeLessThan(severityRank("high"));
    expect(severityRank("high")).toBeLessThan(severityRank("moderate"));
  });
});

describe("crisis gate ordering guarantee", () => {
  const input = {
    userId: "user-1",
    threadId: "thread-1",
    messageId: "msg-1",
    recentTurns: [],
  };

  it("returns the crisis response for critical (explicit plan) without ever consulting the rate limiter", async () => {
    const supabase = fakeSupabase();
    const result = await runCrisisGate(supabase, {
      ...input,
      content: "I have the pills ready for tonight",
    });
    expect(result?.crisis.type).toBe("crisis");
    expect(result?.crisis.severity).toBe("critical");
    expect(supabase.touched).not.toContain("chat_rate_limits");
  });

  it("passes ordinary messages through without touching the rate limiter", async () => {
    const supabase = fakeSupabase();
    const result = await runCrisisGate(supabase, {
      ...input,
      content: "I had a decent day, just tired",
    });
    expect(result).toBeNull();
    expect(supabase.touched).not.toContain("chat_rate_limits");
  });

  it("logs high severity for admin review but does not interrupt the chat", async () => {
    const { logCrisisEvent } = await import("./crisis-alert.server");
    const supabase = fakeSupabase();
    const result = await runCrisisGate(supabase, {
      ...input,
      content: "I want to kill myself",
    });
    expect(result).toBeNull();
    expect(vi.mocked(logCrisisEvent)).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ severity: "high" }),
    );
    // Logged for admins, but never surfaced as a chat message or thread bump.
    expect(supabase.touched).not.toContain("chat_messages");
    expect(supabase.touched).not.toContain("chat_threads");
    expect(supabase.touched).not.toContain("chat_rate_limits");
  });

  it("logs moderate severity for admin review but does not interrupt the chat", async () => {
    const { logCrisisEvent } = await import("./crisis-alert.server");
    const supabase = fakeSupabase();
    const result = await runCrisisGate(supabase, {
      ...input,
      content: "I wish I could just disappear forever",
    });
    expect(result).toBeNull();
    expect(vi.mocked(logCrisisEvent)).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ severity: "moderate" }),
    );
    expect(supabase.touched).not.toContain("chat_messages");
    expect(supabase.touched).not.toContain("chat_threads");
    expect(supabase.touched).not.toContain("chat_rate_limits");
  });

  it("escalates when the semantic backstop flags a clear-regex message", async () => {
    const { classifyCrisisRisk } = await import("./crisis-classifier.server");
    vi.mocked(classifyCrisisRisk).mockResolvedValueOnce({
      flagged: true,
      severity: "critical",
      reason: "implicit plan",
    } as never);

    const supabase = fakeSupabase();
    const result = await runCrisisGate(supabase, {
      ...input,
      content: "everyone will be fine after friday, I've sorted it all out",
    });
    expect(result?.crisis.severity).toBe("critical");
    expect(result?.updatedUserMessage).toBe(true);
    expect(supabase.touched).not.toContain("chat_rate_limits");
  });
});

describe("semantic classifier fail-safe", () => {
  const base = { userId: "u", threadId: "t", messageId: "m", recentTurns: [] };
  const benign = "i honestly don't know how to put any of this into words right now";

  async function withClassifierUnavailable() {
    const { classifyCrisisRisk } = await import("./crisis-classifier.server");
    vi.mocked(classifyCrisisRisk).mockResolvedValueOnce({
      flagged: false,
      severity: null,
      reason: "classifier_unavailable",
      failedOpen: true,
    } as never);
  }

  it("fails OPEN for a plain-English message when the classifier is unavailable", async () => {
    await withClassifierUnavailable();
    const supabase = fakeSupabase();
    const result = await runCrisisGate(supabase, { ...base, content: benign, language: "en" });
    expect(result).toBeNull();
    expect(supabase.touched).not.toContain("chat_rate_limits");
  });

  it("fails SAFE for a non-English locale when the classifier is unavailable", async () => {
    await withClassifierUnavailable();
    const supabase = fakeSupabase();
    const result = await runCrisisGate(supabase, { ...base, content: benign, language: "fr" });
    expect(result?.crisis.type).toBe("crisis");
    expect(result?.crisis.severity).toBe("moderate");
    expect(result?.updatedUserMessage).toBe(true);
    // localized copy is threaded all the way through the gate
    expect(result?.crisis.resources.some((r) => r.contact.includes("3114"))).toBe(true);
    expect(hasUsLines(result?.crisis.resources ?? [])).toBe(false);
    expect(supabase.touched).not.toContain("chat_rate_limits");
  });

  it("fails SAFE for Arabic-script content even when the locale is unset", async () => {
    await withClassifierUnavailable();
    const supabase = fakeSupabase();
    const result = await runCrisisGate(supabase, {
      ...base,
      content: "مرحبا كيف حالك اليوم", // no crisis terms; Arabic script
    });
    expect(result?.crisis.type).toBe("crisis");
    expect(result?.crisis.severity).toBe("moderate");
    expect(result?.updatedUserMessage).toBe(true);
    expect(supabase.touched).not.toContain("chat_rate_limits");
  });
});

describe("localized crisis resources", () => {
  it("en still leads with the US lines", () => {
    expect(hasUsLines(crisisCopy("en").resources)).toBe(true);
  });

  it("fr drops the US lines and carries 3114 + findahelpline", () => {
    const r = crisisCopy("fr").resources;
    expect(hasUsLines(r)).toBe(false);
    expect(r.some((x) => x.contact.includes("3114"))).toBe(true);
    expect(r.some((x) => x.contact.toLowerCase().includes("findahelpline.com"))).toBe(true);
  });

  it("ar drops the US lines and leads with findahelpline", () => {
    const r = crisisCopy("ar").resources;
    expect(hasUsLines(r)).toBe(false);
    expect(r[0]?.contact.toLowerCase()).toContain("findahelpline.com");
  });

  it("unknown / missing locale falls back to English copy", () => {
    expect(hasUsLines(crisisCopy("de").resources)).toBe(true);
    expect(crisisCopy(null)).toBe(crisisCopy("en"));
  });

  it("buildCrisisResponse threads the locale into message and resources", () => {
    const fr = buildCrisisResponse([], "moderate", "fr");
    expect(fr.message).toContain("Merci");
    expect(hasUsLines(fr.resources)).toBe(false);

    const en = buildCrisisResponse([], "high", "en");
    expect(hasUsLines(en.resources)).toBe(true);
  });
});
