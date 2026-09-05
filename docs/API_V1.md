# Mobile API — `/api/v1` (endpoint inventory)

> **`docs/MOBILE_API.md` is the canonical contract for the Flutter integration.**
> This file is the fuller inventory of every `/api/v1/*` route that exists,
> including ones outside the mobile spec's scope (preferences, personas, profile,
> mood, habits, exercises, export, billing). Where the two disagree on a path or
> shape, `MOBILE_API.md` wins. Notably `POST /api/v1/chat/send` is now
> `POST /api/v1/chat/messages`.

A thin JSON surface for the separate mobile app. Every handler forwards to the
same server-side logic the web app uses — no business logic is duplicated.

## Auth

Send the Supabase session access token as `Authorization: Bearer <jwt>` on every
request except the two public endpoints below. The token is verified by the
`requireSupabaseAuth` middleware; a missing/invalid token returns
`401 {"error":"Unauthorized"}`. All queries run under RLS scoped to that user.

Errors: `400` validation (`{"error","details"}`), `401` auth, `501` not
implemented (billing), `500` otherwise (`{"error":"Internal error"}`, logged).

## Endpoints

| Method             | Path                              | Wraps                                     | Notes                                                                                          |
| ------------------ | --------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET                | `/api/v1/entitlements`            | `getEntitlements`                         | tier, billing interval, enforced daily cap (`dailyLimit`; free 8 / pro 200 / premium 500), usedToday, weekly voice allowance + usage + `nextCallAvailableAt`, feature flags |
| GET                | `/api/v1/preferences`             | `getMyPreferences`                        | companion persona, theme, language                                                             |
| PATCH              | `/api/v1/preferences`             | `setMyPreferences`                        | `{ companionPersona?, theme? }`                                                                |
| GET                | `/api/v1/personas`                | `listCompanionPersonas`                   | **public** — persona catalogue                                                                 |
| GET                | `/api/v1/profile`                 | `getMyProfile`                            | profile + intro + recent moods                                                                 |
| GET · POST         | `/api/v1/onboarding`              | `getMyProfile` · `completeOnboarding`     |                                                                                                |
| POST               | `/api/v1/mood`                    | `logMood`                                 |                                                                                                |
| GET · POST · PATCH | `/api/v1/habits`                  | `listHabits` · `createHabit` · `logHabit` |                                                                                                |
| GET · POST         | `/api/v1/exercises`               | `listExercises` · `completeExercise`      |                                                                                                |
| GET · POST         | `/api/v1/screeners`               | `getScreenerState` · `submitScreener`     | PHQ-9 / GAD-7                                                                                  |
| POST               | `/api/v1/screeners/$type/responses` | `submitScreenerCore`                    | `:type` = phq9/gad7 in path; body `{ responses }`; PHQ-9 item-9 escalation                    |
| GET · DELETE       | `/api/v1/export`                  | `buildMyReport` · `deleteMyData`          | therapist-shareable text report / wipe                                                         |
| GET                | `/api/v1/crisis-resources?lang=`  | `crisisCopy`                              | **public, never gated**                                                                        |
| GET                | `/api/v1/chat/threads`            | `listThreadsCore`                         | create a thread via `chat/messages` with no `thread_id`                                         |
| GET                | `/api/v1/chat/threads/$id/messages` | `getThreadMessagesPageCore`             | keyset-paginated `?limit=&before=`; returns `nextBefore`                                        |
| GET                | `/api/v1/chat/history?thread_id=` | `getThreadHistory`                        | superseded by `chat/threads/$id/messages`                                                       |
| POST               | `/api/v1/chat/messages`           | `sendMessage`                             | body `{ thread_id?, content, quick_action? }`; runs the full crisis gate + rate limiter        |
| POST               | `/api/v1/billing/checkout`        | Stripe Checkout                           | body `{ plan: "pro" \| "premium", interval: "monthly" \| "yearly" }` → hosted checkout URL      |
| GET                | `/api/v1/admin/users/$userId/cost`| `getCustomerCostReport`                   | **admin only, internal** — tier, interval, chat/voice/combined estimated cost for the period    |
| POST               | `/api/v1/billing/verify-receipt`  | `getReceiptValidator().validate`          | **stub — returns 501** until store integration lands (`src/lib/billing/receipt-validation.ts`) |

## Not done in this pass

- Billing/receipt validation is interface-only (item 8 wires enforcement into
  `sendMessage` once the numbers are set).
- `companion_persona` / `theme_preference` need migration
  `20260902000100_profile_preferences.sql` applied (Lovable picks it up).
- No API versioning negotiation / deprecation headers yet.
- Endpoints are not rate-limited beyond what the wrapped server fns already do.
