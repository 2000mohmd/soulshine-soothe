import { expect, test } from "@playwright/test";
import { NO_ACCOUNT_REASON, authHeaders, hasTestAccount } from "./session";

// The /api/v1 mobile surface with a real bearer token. Read-mostly: the only
// writes are one mood check-in and rejected (400) bodies, all on the throwaway
// test account. Skipped unless E2E_EMAIL / E2E_PASSWORD are set.

test.describe("v1 API, signed in", () => {
  test.skip(!hasTestAccount, NO_ACCOUNT_REASON);

  let headers: Record<string, string>;
  test.beforeEach(async () => {
    headers = await authHeaders();
  });

  test("GET /entitlements returns tier, chat and voice limits", async ({ request }) => {
    const res = await request.get("/api/v1/entitlements", { headers });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(["free", "pro", "premium", "org"]).toContain(body.tier);
    expect(typeof body.chat.dailyLimit).toBe("number");
    expect(typeof body.chat.usedToday).toBe("number");
    expect(body.voice.maxCallMinutes).toBe(30);
    expect(body.features).toBeTruthy();
  });

  test("GET /profile returns the onboarded profile", async ({ request }) => {
    const res = await request.get("/api/v1/profile", { headers });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.profile.onboarding_completed).toBe(true);
    expect(Array.isArray(body.recentMoods)).toBe(true);
  });

  for (const path of [
    "/api/v1/preferences",
    "/api/v1/habits",
    "/api/v1/exercises",
    "/api/v1/chat/threads",
    "/api/v1/support/threads",
    "/api/v1/calls/sessions",
    "/api/v1/export",
  ]) {
    test(`GET ${path} → 200 JSON`, async ({ request }) => {
      const res = await request.get(path, { headers });
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("application/json");
      await res.json();
    });
  }

  test("GET /screeners reports PHQ-9 and GAD-7 state", async ({ request }) => {
    const body = await (await request.get("/api/v1/screeners", { headers })).json();
    const types = body.screeners.map((s: { type: string }) => s.type);
    expect(types).toEqual(expect.arrayContaining(["phq9", "gad7"]));
    for (const s of body.screeners) expect(typeof s.due).toBe("boolean");
  });

  test("POST /mood logs a check-in that shows up in /profile", async ({ request }) => {
    const note = `e2e ${Date.now()}`;
    const res = await request.post("/api/v1/mood", {
      headers,
      data: { score: 4, note, tags: ["e2e"] },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const profile = await (await request.get("/api/v1/profile", { headers })).json();
    expect(profile.recentMoods.some((m: { note: string | null }) => m.note === note)).toBe(true);
  });

  test("POST /mood rejects an out-of-range score with 400", async ({ request }) => {
    const res = await request.post("/api/v1/mood", { headers, data: { score: 9 } });
    expect(res.status()).toBe(400);
  });

  test("POST /chat/messages rejects an empty message with 400", async ({ request }) => {
    const res = await request.post("/api/v1/chat/messages", { headers, data: { content: "" } });
    expect(res.status()).toBe(400);
  });

  test("POST /billing/verify-receipt is still a 501 stub", async ({ request }) => {
    const res = await request.post("/api/v1/billing/verify-receipt", {
      headers,
      data: { platform: "ios", receipt: "e2e", productId: "pro_monthly" },
    });
    expect(res.status()).toBe(501);
  });
});
