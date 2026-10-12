import { chromium, type FullConfig } from "@playwright/test";

// The Vite dev server compiles each module on first request, and client-only
// routes (/auth is `ssr: false`) pull the whole module graph into the browser.
// On a cold server, parallel workers all waiting on that first compile blow
// past the 10s expect timeout. Load the heavy pages once before any test runs.
export default async function warmup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const path of ["/", "/auth", "/crisis"]) {
    await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle", timeout: 120_000 });
  }
  await browser.close();
}
