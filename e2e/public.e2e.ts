import { expect, test } from "@playwright/test";

// Everything reachable without an account. Auth'd flows live in
// authenticated.spec.ts (skipped unless E2E_EMAIL / E2E_PASSWORD are set).

test.describe("public pages", () => {
  test("landing page renders and links to auth", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/calm ai|kalm/i);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const authLink = page.getByRole("link", { name: /sign in|get started|create/i }).first();
    await expect(authLink).toBeVisible();
    await authLink.click();
    await expect(page).toHaveURL(/\/auth/);
  });

  test("auth page is magic-link + Google & Apple, no password", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /sign-in link/i })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /apple/i })).toBeVisible();
  });

  test("unknown routes show the 404 page", async ({ page }) => {
    await page.goto("/definitely-not-a-page");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  });

  test("crisis resources page is reachable and NOT gated by auth", async ({ page }) => {
    await page.goto("/crisis");
    await expect(page).toHaveURL(/\/crisis/); // no redirect to /auth
    // some phone/number/helpline text is present
    await expect(page.getByText(/helpline|988|crisis|emergency|3114|112/i).first()).toBeVisible();
  });

  test("legal page renders", async ({ page }) => {
    await page.goto("/legal");
    await expect(page).toHaveURL(/\/legal/);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
});

test.describe("route protection", () => {
  for (const path of ["/chat", "/settings", "/insights", "/exercises", "/habits"]) {
    test(`${path} redirects to /auth when signed out`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth/);
    });
  }
});
