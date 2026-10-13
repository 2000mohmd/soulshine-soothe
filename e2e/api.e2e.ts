import { expect, test } from "@playwright/test";

// The versioned mobile API + public routes, exercised over HTTP (no browser).
// Contract-level assertions; the deep logic is covered by the vitest suite.

test.describe("GET /api/v1/crisis-resources — never gated", () => {
  test("returns the resource list with no auth", async ({ request }) => {
    const res = await request.get("/api/v1/crisis-resources");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.resources)).toBe(true);
    expect(body.resources.length).toBeGreaterThan(0);
    expect(body.disclaimer).toBeTruthy();
    expect(body.language).toBe("en");
  });

  test("honours ?lang=fr and localises", async ({ request }) => {
    const body = await (await request.get("/api/v1/crisis-resources?lang=fr")).json();
    expect(body.language).toBe("fr");
    expect(body.resources.some((r: { contact: string }) => r.contact.includes("3114"))).toBe(true);
  });

  test("degrades to English for a garbage ?lang", async ({ request }) => {
    const body = await (await request.get("/api/v1/crisis-resources?lang=zz")).json();
    expect(body.language).toBe("en");
    expect(body.resources.length).toBeGreaterThan(0);
  });
});

test("GET /api/v1/personas is public and lists personas", async ({ request }) => {
  const res = await request.get("/api/v1/personas");
  expect(res.status()).toBe(200);
  expect(await res.json()).toBeTruthy();
});

test.describe("v1 endpoints require a bearer token", () => {
  const cases: { method: "get" | "post"; path: string }[] = [
    { method: "post", path: "/api/v1/chat/messages" },
    { method: "get", path: "/api/v1/entitlements" },
    { method: "get", path: "/api/v1/chat/threads" },
    { method: "post", path: "/api/v1/screeners/phq9/responses" },
    { method: "post", path: "/api/v1/onboarding" },
    { method: "get", path: "/api/v1/human-support" },
    { method: "post", path: "/api/v1/human-support" },
    { method: "post", path: "/api/v1/human-support/messages" },
    { method: "get", path: "/api/v1/safety-plan" },
    { method: "get", path: "/api/v1/daily-prompt" },
    { method: "get", path: "/api/v1/digests" },
    { method: "get", path: "/api/v1/nudges" },
    { method: "get", path: "/api/v1/care-resources" },
    { method: "get", path: "/api/v1/memories" },
    { method: "get", path: "/api/v1/language" },
    { method: "get", path: "/api/v1/guardian-consent" },
    { method: "get", path: "/api/v1/habits/insights" },
    { method: "post", path: "/api/v1/habits/suggested" },
    { method: "get", path: "/api/v1/chat/threads/primary" },
    { method: "get", path: "/api/v1/exercises/box-breathing" },
    { method: "post", path: "/api/v1/voice/transcribe" },
    { method: "get", path: "/api/v1/data-summary" },
  ];
  for (const c of cases) {
    test(`${c.method.toUpperCase()} ${c.path} → 401 without a token`, async ({ request }) => {
      const res =
        c.method === "get" ? await request.get(c.path) : await request.post(c.path, { data: {} });
      expect(res.status()).toBe(401);
    });
  }

  test("a malformed bearer token is still 401 (never falls through)", async ({ request }) => {
    const res = await request.get("/api/v1/entitlements", {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("POST /api/public/unsubscribe", () => {
  test("rejects a missing / bad token with 400", async ({ request }) => {
    const res = await request.get("/api/public/unsubscribe?u=someone&t=bad");
    expect(res.status()).toBe(400);
    expect((await res.text()).toLowerCase()).toContain("isn't valid");
  });
});
