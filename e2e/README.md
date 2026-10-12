# End-to-end tests (Playwright)

`npm test` (vitest) covers unit + contract logic. These specs drive the real app
in Chromium and hit the HTTP API, against the Vite dev server on `:8080`
(reused if one is already running).

## Install

Playwright is **not** in `package.json` (`bun.lock` is the tracked lockfile and
an npm dep would desync it). Install on demand:

```bash
npm install --no-save @playwright/test
npx playwright install chromium
```

To track it properly instead: `bun add -d @playwright/test`.

## Running

```bash
npm run test:e2e                     # everything that can run
npm run test:e2e -- --ui             # interactive
npm run test:e2e -- e2e/public.e2e.ts
```

`playwright.config.ts` loads `.env`, so the `VITE_SUPABASE_*` values are picked
up automatically.

## Signed-in specs

The `/auth` page is magic-link + Google/Apple only, which a test can't click
through. Instead, `session.ts` signs a throwaway account in with a password over
the Supabase auth API and injects the session into the browser
(`localStorage["sb-<project>-auth-token"]`) and API calls (bearer token).

One-time setup:

1. Create an account in the app and finish onboarding (age 18+).
2. Give that account a password (Supabase dashboard → Authentication → Users,
   or the admin API `PUT /auth/v1/admin/users/<id>` with `{"password": "…"}`).
3. Run with:

```bash
E2E_EMAIL=you+e2e@example.com E2E_PASSWORD=... npm run test:e2e
```

Without those two variables the signed-in specs are skipped, not failed.

Use a **dedicated throwaway account**: the specs log mood check-ins against it.

## What's covered

| Spec                       | Account? | Scope                                                                                                                                                 |
| -------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.e2e.ts`            | no       | landing → `/auth`, magic-link + OAuth sign-in UI (no password field), `/crisis` never gated, `/legal`, 404 page, protected routes redirect to `/auth` |
| `api.e2e.ts`               | no       | crisis resources (no auth, `?lang=`, fallback), public personas, protected `/api/v1/*` → 401, bad unsubscribe token → 400                             |
| `i18n.e2e.ts`              | no       | language switcher, Arabic RTL, persists across reload                                                                                                 |
| `authenticated.e2e.ts`     | yes      | all 10 member pages render (no redirect, no error boundary, no JS errors), chat composer, settings sections, `/crisis` while signed in                |
| `api-authenticated.e2e.ts` | yes      | entitlements/profile/screeners shapes, every read endpoint → 200 JSON, mood write round-trips into profile, validation → 400, receipt stub → 501      |

### Opt-in

- `E2E_LLM=1`: sends one real chat message and waits for the companion reply.
  Costs model tokens and one of the account's daily messages.

## Deliberately not covered

- **Crisis-gate messages**: sending crisis language for real creates crisis
  events and pages the admin team by email. The gate is covered by vitest
  (`crisis-gate.test.ts`).
- **Onboarding, account deletion, billing checkout**: each needs a fresh
  account per run (an admin/service key to create and delete users) or touches
  Stripe. Add when there's a separate test Supabase project.
- **CI**: these run locally only. They need a browser, a Supabase project and a
  test account; wire a CI job when there's a staging project to point at.
