import { expect, test } from "@playwright/test";
import { NO_ACCOUNT_REASON, hasTestAccount, signIn } from "./session";

// Signed-in browser flows. Skipped unless E2E_EMAIL / E2E_PASSWORD point at an
// already-onboarded throwaway account (see e2e/README.md).

test.describe("authenticated", () => {
  test.skip(!hasTestAccount, NO_ACCOUNT_REASON);

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // Every member page renders for a real signed-in user: no bounce to /auth or
  // /onboarding, no error boundary, no 404.
  for (const path of [
    "/dashboard",
    "/chat",
    "/check-ins",
    "/insights",
    "/exercises",
    "/habits",
    "/care",
    "/support",
    "/plans",
    "/settings",
  ]) {
    test(`${path} renders`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));
      await expect(page.getByRole("heading").first()).toBeVisible();
      await expect(page.getByText(/page didn't load|page not found/i)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test("chat has a composer", async ({ page }) => {
    await page.goto("/chat");
    await expect(page.locator("textarea")).toBeVisible();
  });

  test("settings shows email preferences and AI memory", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /emails from kalm/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /what kalm remembers about you/i }),
    ).toBeVisible();
    await expect(page.getByRole("switch").first()).toBeVisible();
  });

  test("crisis page stays reachable while signed in", async ({ page }) => {
    await page.goto("/crisis");
    await expect(page).toHaveURL(/\/crisis/);
    await expect(page.getByText(/helpline|988|crisis|emergency|3114|112/i).first()).toBeVisible();
  });

  // Real model call: costs tokens and uses one of the account's daily messages,
  // so it only runs when asked for.
  test("sending a chat message gets a companion reply", async ({ page }) => {
    test.skip(!process.env["E2E_LLM"], "set E2E_LLM=1 to run the real chat round trip");
    test.setTimeout(90_000);

    await page.goto("/chat");
    const marker = `e2e ping ${Date.now()}`;
    await page.locator("textarea").fill(`${marker}: what's one quick way to relax my shoulders?`);
    await page.locator("textarea").press("Enter");

    const sent = page.getByText(marker);
    await expect(sent).toBeVisible();
    // the reply is the next message after their bubble (div.justify-end)
    const reply = sent.locator(
      "xpath=ancestor::div[contains(@class,'justify-end')]/following-sibling::div[1]//p",
    );
    await expect(reply.first()).toHaveText(/\w{3,}/, { timeout: 60_000 });
  });
});
