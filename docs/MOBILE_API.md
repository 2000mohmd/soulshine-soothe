# Kalm Mobile API — connecting the Flutter app

This is the complete, verified contract between the Flutter app and the Kalm
backend. Every endpoint here calls the **same server-side logic the web app
uses** — nothing is reimplemented, so behavior (crisis handling, rate limits,
screener escalation) is identical on both.

> **This file replaces the previous `docs/MOBILE_API.md` and
> `docs/API_V1.md`.** Both had drifted out of date (missing endpoints, one
> incorrectly said push notifications and voice calls were "out of scope"
> when both are actually built). Trust this file over anything else you find
> referencing the mobile API.

---

## 1. Quick start

### 1.1 What you need from the backend team

| Value | Where to get it |
|---|---|
| Supabase Project URL | `https://c--131e98f1-a346-4d26-80a3-2be1f7e5e55c-prod.lovable.cloud` |
| Supabase publishable (anon) key | `sb_publishable_4wG145sBMTCz4HhD8VQzUA_VTSNAe8m` |
| API base URL | `<deployed app domain>/api/v1` — **ask the backend owner for the exact production domain**; it is not fixed in this repo |

The publishable key is meant to be embedded in a client app (it is the
mobile/web equivalent of a public API key, not a secret) — safe to commit to
the Flutter project.

### 1.2 Add the Supabase Flutter SDK

```yaml
# pubspec.yaml
dependencies:
  supabase_flutter: ^2.0.0
  http: ^1.0.0
```

```dart
// main.dart
await Supabase.initialize(
  url: 'https://c--131e98f1-a346-4d26-80a3-2be1f7e5e55c-prod.lovable.cloud',
  anonKey: 'sb_publishable_4wG145sBMTCz4HhD8VQzUA_VTSNAe8m',
);
```

### 1.3 The two ways the app talks to the backend

1. **Supabase SDK directly** — for sign-up/sign-in/session management, and
   for a handful of read-mostly tables under Row-Level Security (see
   [§8](#8-direct-supabase-access-no-api-wrapper-needed)).
2. **The `/api/v1` HTTP API** — for everything that must run through
   business logic: sending a chat message (crisis detection + rate limiting),
   submitting a screener (PHQ-9 item-9 crisis escalation), onboarding
   (server-side age check), billing, push token registration, voice calls,
   and a few convenience wrappers (profile, mood, habits, exercises,
   preferences) that now exist as real endpoints.

**Rule of thumb:** if it can trigger crisis handling, rate limiting, the
companion, or a payment — use the `/api/v1` endpoint. Otherwise, plain reads
can go straight through the SDK.

### 1.4 Auth token for every `/api/v1` call

```dart
final session = Supabase.instance.client.auth.currentSession;
final token = session?.accessToken;

final response = await http.post(
  Uri.parse('$apiBase/chat/messages'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({'content': 'Hello'}),
);
```

Supabase's SDK auto-refreshes `currentSession` in the background, so re-read
`accessToken` right before each call rather than caching it long-term.

### 1.5 End-to-end flow for a brand-new user

1. `Supabase.instance.client.auth.signUp(email: ..., password: ...)` (SDK).
2. Check the Lovable Cloud dashboard (Authentication → Providers → Email) to
   know whether email confirmation is required before sign-in — **not
   verifiable from this repo**, confirm with the backend owner.
3. `Supabase.instance.client.auth.signInWithPassword(...)` (SDK).
4. `POST /api/v1/onboarding` with the person's real date of birth, consents,
   and baseline mood (§4).
5. `POST /api/v1/chat/messages` with no `thread_id` to start the first
   conversation (§5.1) — a thread is created implicitly.
6. From there: `GET /api/v1/entitlements` to know the plan limits,
   `GET /api/v1/chat/threads` + `.../messages` to restore history, etc.

---

## 2. Conventions

- **Base path:** `/api/v1` on the deployed app's domain.
- **Auth header:** `Authorization: Bearer <supabase access token>` on every
  endpoint except the two explicitly marked **public** below.
- **Content type:** `application/json` for every request body.
- **CORS:** not configured on these routes. Irrelevant for iOS/Android
  native builds; if you also ship Flutter Web, requests will fail
  cross-origin until CORS headers are added — flag this to the backend owner
  before relying on Flutter Web.

### Error shape

Every error is `{ "error": string, "details"?: unknown }` with one of these
statuses:

| Status | Meaning |
|---|---|
| `400` | Invalid JSON body, failed validation, or a business-rule rejection (e.g. under-13 sign-up) |
| `401` | Missing / malformed / expired / revoked bearer token |
| `402` | Feature requires a higher plan (voice calls on Free) |
| `403` | Forbidden (admin-only endpoint, or a guardian-consent hold on a teen account) |
| `404` | Resource not found, or not owned by the caller |
| `409` | Conflict (e.g. a call session is already active) |
| `429` | Rate limit / plan usage limit hit |
| `501` | Endpoint intentionally not implemented yet (receipt validation) |
| `503` | Feature not configured on the server yet (voice calls with no API key set) |
| `500` | Unexpected server error — details are logged server-side, not returned |

Auth is verified by `authenticateBearer` (`src/lib/api-auth.server.ts`),
which does a **real round trip** to Supabase Auth (`auth.getUser(token)`), so
an expired or revoked token is rejected, not just a malformed one.

---

## 3. All endpoints at a glance

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/chat/messages` | yes | send a message — crisis-gated, rate-limited |
| POST | `/api/v1/chat/messages/stream` | yes | same, as a server-sent-events stream |
| GET | `/api/v1/chat/threads` | yes | list the caller's threads |
| GET | `/api/v1/chat/threads/:id/messages` | yes | paginated message history (preferred) |
| GET | `/api/v1/chat/history?thread_id=` | yes | older, non-paginated history read (superseded) |
| GET | `/api/v1/crisis-resources` | **no** | localized crisis resource list |
| GET | `/api/v1/entitlements` | yes | plan tier, message/voice limits and usage |
| POST | `/api/v1/onboarding` | yes | complete onboarding (server computes age) |
| GET | `/api/v1/profile` | yes | profile + intro + recent moods |
| GET | `/api/v1/preferences` | yes | companion persona, theme, language |
| PATCH | `/api/v1/preferences` | yes | update persona / theme |
| GET | `/api/v1/personas` | **no** | companion persona catalogue |
| POST | `/api/v1/mood` | yes | log a mood check-in |
| GET | `/api/v1/habits` | yes | list habits + last 30 days of logs |
| POST | `/api/v1/habits` | yes | create a habit |
| PATCH | `/api/v1/habits` | yes | log/unlog a habit for a day |
| GET | `/api/v1/exercises` | yes | list exercises + recent completions |
| POST | `/api/v1/exercises` | yes | record a completion |
| GET | `/api/v1/screeners` | yes | PHQ-9/GAD-7 state (due dates, history) |
| POST | `/api/v1/screeners` | yes | submit a screener (alt. to the path below) |
| POST | `/api/v1/screeners/:type/responses` | yes | submit PHQ-9/GAD-7 — item-9 crisis escalation |
| GET | `/api/v1/export` | yes | therapist-shareable plain-text report |
| DELETE | `/api/v1/export` | yes | wipe wellness data (**not** account deletion) |
| DELETE | `/api/v1/account` | yes | full, irreversible account deletion |
| POST | `/api/v1/calls/sessions` | yes | start a live voice session (Pro/Premium only) |
| GET | `/api/v1/calls/sessions` | yes | voice call history |
| POST | `/api/v1/calls/sessions/:id/turns` | yes | record one spoken turn — crisis-gated |
| POST | `/api/v1/calls/sessions/:id/end` | yes | finalize a call session |
| POST | `/api/v1/billing/checkout` | yes | Stripe Checkout session URL |
| POST | `/api/v1/billing/portal` | yes | Stripe customer portal URL (manage/cancel) |
| POST | `/api/v1/billing/verify-receipt` | yes | **stub — always 501**, see §7.3 |
| POST | `/api/v1/push/register-token` | yes | register an FCM device token |
| DELETE | `/api/v1/push/register-token` | yes | remove a device token (call on sign-out) |
| GET | `/api/v1/admin/users/:userId/cost` | yes (admin) | internal only — not for the member app |

---

## 4. Onboarding

### `POST /api/v1/onboarding`

Calls the same core the web onboarding flow uses.

**Request:**

```json
{
  "preferred_name": "string, 1-60 chars",
  "account_type": "general | condition | teen | org_member",
  "privacy_consent": true,
  "ai_context_consent": true,
  "date_of_birth": "YYYY-MM-DD",
  "guardian_email": "email — only meaningful if computed age < 18",
  "guardian_name": "string — optional",
  "intro_text": "string, optional",
  "goals": ["string", "..."],
  "stressors": ["string", "..."],
  "existing_diagnosis": "string, optional",
  "communication_preference": "string, optional",
  "topics_to_avoid": "string, optional",
  "in_professional_care": false,
  "baseline_mood": 1,
  "baseline_tags": ["string", "..."]
}
```

**Important — read carefully:**

- Send a **real date of birth**, not a hardcoded consent flag. There is no
  `age_confirmed_13_plus` field — the server computes age from
  `date_of_birth` itself: rejects under-13 with `400`, and **forces
  `account_type: "teen"`** for anyone under 18 regardless of what the client
  sent.
- Under 18 also sets `guardian_consent_required: true` on the profile — the
  companion is held until a guardian consents (see the public
  `guardian-consent` flow, out of scope for the mobile app's own endpoints).
- `privacy_consent` must literally be `true`.
- This is an **upsert**, safe to call again if a previous attempt partially
  failed.
- On success, a warm, personalized opening message is generated and dropped
  into the person's very first chat thread — so after onboarding completes,
  go straight to the chat screen and load history; don't show an empty state.

**Response `200`:** `{ "ok": true }`.
**Errors:** `400` for a malformed body, a non-`YYYY-MM-DD` DOB, or an
under-13 DOB (`"Kalm is for people aged 13 and over."`).

### `GET /api/v1/profile`

Returns `{ profile, intro, recentMoods }` — the person's `profiles` row, the
free-text intro/goals/stressors from `user_profiles`, and their last 7 mood
logs. Use `profile.onboarding_completed` to decide whether to route into
onboarding or straight into the app (mirrors the web app's own gate).

---

## 5. Chat

### 5.1 `POST /api/v1/chat/messages`

The core of the app. The deterministic crisis gate (regex + semantic
backstop) runs **before** the per-user rate limiter, on every request, with
no pre-check ahead of it — this ordering is safety-critical and tested.

**Request:**

```json
{
  "thread_id": "uuid, optional — omit to start a new thread",
  "content": "string, 1-4000 chars",
  "quick_action": "string, optional — one of the known quick-action ids"
}
```

**Response `200`** — `reply` is one of three shapes, discriminated by
`type` / the presence of `reply.limit`:

**Normal reply:**

```json
{
  "thread_id": "uuid",
  "userMessage": { "id": "uuid", "sender": "user", "content": "…", "flagged_crisis": false, "created_at": "ISO-8601" },
  "reply": {
    "type": "message",
    "id": "uuid",
    "content": "…",
    "created_at": "ISO-8601",
    "actions": [ /* see §5.4 */ ]
  }
}
```

**Crisis reply** — always the full structured object, never raw text to
parse:

```json
{
  "reply": {
    "type": "crisis",
    "severity": "critical",
    "message": "localized supportive message",
    "matched": ["…"],
    "resources": [ { "name": "…", "contact": "…", "detail": "…" } ],
    "disclaimer": "…",
    "id": "uuid",
    "created_at": "ISO-8601"
  }
}
```

Show the crisis message + `resources` + `disclaimer` and stop — do not run
this text through your normal message bubble renderer.

**Note on severity:** as of the current backend, only `severity: "critical"`
(an explicit plan, method, or timeframe) produces this crisis object in
ordinary chat. `high`/`moderate` severities are still logged for the admin
team and still trigger their alert email, but the conversation continues
normally rather than interrupting the person — do not build client UI that
assumes every flagged message shows a crisis card.

**Rate / daily-cap notice** is **not** an error — it's a normal `200` with
`reply.type === "message"`:

```json
"reply": {
  "type": "message", "id": "uuid",
  "content": "You've reached your plan's message limit for today. Upgrade any time and we can pick this right back up — or I'll be right here again tomorrow.",
  "created_at": "ISO-8601", "actions": [],
  "limit": { "reason": "daily", "tier": "free", "dailyLimit": 8, "resetsAt": "ISO-8601 (next UTC midnight)" }
}
```

When `reply.limit.reason === "daily"`, show an **upgrade prompt** (link to
your plan-picker screen / `POST /api/v1/billing/checkout`) — not a crisis
card, not a generic error. `reply.limit` is absent on a normal reply, and
present with `reason: "window"` (no upgrade framing — just a short
"slow down a moment" throttle) if a short-term burst limit trips instead.

### 5.2 `POST /api/v1/chat/messages/stream`

Same request body and same pipeline as §5.1 (they share the same
crisis-gate/rate-limiter code path) — the difference is the response is
`text/event-stream`:

- Zero or more `event: delta` frames, `data: { "text": "…partial…" }`, as the
  companion's reply is generated.
- Exactly one `event: done` frame at the end, `data:` being the **same JSON
  shape** `POST /api/v1/chat/messages` returns in one shot — so you can
  reuse one response model for both endpoints.
- A crisis reply or a rate-limit notice is **never** split into deltas —
  those arrive whole, immediately, as a single `done` event with nothing
  before it.
- `event: error`, `data: { "error": "…" }` if generation fails mid-stream
  (too late at that point for a normal HTTP error status).

Use `dart:io`'s `HttpClient` or the `http` package's streamed request to
read Server-Sent Events; there's no special auth beyond the same Bearer
header.

### 5.3 Reading history

- **`GET /api/v1/chat/threads`** — `[{ id, title, created_at, updated_at }]`,
  newest activity first. There is no create-thread endpoint — a thread is
  created implicitly by §5.1 with no `thread_id`; use the `thread_id` it
  returns.
- **`GET /api/v1/chat/threads/:id/messages?limit=&before=`** (preferred) —
  keyset-paginated. `limit` defaults to 50, clamped 1–200. `before` is the
  previous page's `nextBefore` (an exclusive ISO cursor). Returns:

  ```json
  {
    "thread": { "id": "uuid", "title": "…", "created_at": "…", "updated_at": "…" },
    "messages": [
      { "id": "uuid", "sender": "user | assistant | system", "content": "…",
        "content_type": "text | exercise_widget | activity | human_support | rate_limit",
        "exercise_slug": null, "flagged_crisis": false, "quick_action": null,
        "created_at": "ISO-8601" }
    ],
    "nextBefore": "ISO-8601 | null"
  }
  ```

  Messages come back **ascending** (oldest first) for display, even though
  the query itself pages newest-first internally. `nextBefore: null` means
  you've reached the oldest message — stop paging. `404` if the thread isn't
  owned by the caller; `400` for a non-UUID id.

  **`content_type` matters for rendering** — mirror what the web client does:
  - `human_support` — a real support-team reply, mirrored into the thread;
    label it clearly as a person, never as the AI companion.
  - `rate_limit` — a plan-limit / throttle notice; render as plain text, no
    crisis styling, no "talk to a person" button.
  - `exercise_widget` — an inline exercise the companion launched; `content`
    is not meant to be shown raw (fetch the exercise by `exercise_slug` via
    `GET /api/v1/exercises` and render your own widget).
  - anything else / `system` sender with no special `content_type` — this is
    the one case the (now-rare) crisis card belongs under.

- **`GET /api/v1/chat/history?thread_id=`** — an older, non-paginated
  history read. Still works but is superseded by the endpoint above; don't
  build new screens against it.

### 5.4 Companion actions

A normal reply's `actions` array can include (discriminated by `type`):

```
{ type: "mood_logged", score, tags, summary }
{ type: "commitment_created", id, description, summary }
{ type: "commitment_completed", id, description, status: "done"|"skipped", summary }
{ type: "exercise_launch", slug, title, minutes, summary }
{ type: "exercise_completed", slug, title, summary }
{ type: "exercise_widget", slug, title, summary }
{ type: "screener_completed", screener_type: "phq9"|"gad7", total_score, severity, crisis: boolean, summary }
{ type: "stepup_suggested", summary }
```

These are the companion having used a tool mid-conversation (logged a mood,
launched an exercise, completed a screener in-chat, etc.) — show `summary`
as a small inline card under the reply; most also warrant a deep link (e.g.
`exercise_launch` → your exercise player for `slug`).

---

## 6. Crisis resources & entitlements

### `GET /api/v1/crisis-resources?lang=en|ar|fr`

**Public — no auth required, and never gated.** A bad token, a bad `lang`,
or an internal error all still return `200` with the English list — this
endpoint must never itself be the reason someone can't reach help. Language
resolution: `?lang=` → the authenticated user's `profiles.language` (if a
valid token happens to be sent) → English.

```json
{
  "language": "en",
  "resources": [ { "name": "…", "contact": "…", "detail": "…" } ],
  "disclaimer": "…"
}
```

Call this once at app startup and cache it — it's cheap, safe to call
without a session, and a good thing to have on hand before the person is
ever in chat.

### `GET /api/v1/entitlements`

The single source of truth for what a user can currently do — use it to
drive your plan-limit UI instead of guessing from local state.

```json
{
  "tier": "free | pro | premium | org",
  "billingInterval": "monthly | yearly | null",
  "chat": {
    "unlimited": false,
    "dailyLimit": 8,
    "dailyCredits": 8,
    "usedToday": 3,
    "remainingToday": 5,
    "resetsAt": "ISO-8601 (next UTC midnight)"
  },
  "voice": {
    "enabled": false,
    "weeklyLimit": 0,
    "usedThisWeek": 0,
    "remainingThisWeek": 0,
    "windowDays": 7,
    "nextCallAvailableAt": null,
    "maxCallMinutes": 30
  },
  "features": {
    "unlimitedHistory": false,
    "liveSessions": false,
    "dataExport": false
  }
}
```

- `chat.dailyLimit` is the exact number the chat endpoint enforces — one
  source of truth with `reply.limit.dailyLimit` in §5.1.
- For pro/premium/org, `chat.unlimited` is `true` and `dailyCredits` /
  `remainingToday` are `null` (but `dailyLimit` still carries the real cap —
  200 for pro, 500 for premium/org, not literal infinity).
- `voice.enabled` reflects the caller's tier (0 calls/week on free, 1 on
  pro, 2 on premium/org) — gate your call button on this rather than a
  hardcoded tier check.

---

## 7. Billing

### 7.1 `POST /api/v1/billing/checkout`

```json
{ "plan": "pro | premium", "interval": "monthly | yearly", "successUrl": "optional", "cancelUrl": "optional" }
```

All fields optional (defaults: `premium` / `monthly`). Returns:

```json
{ "checkoutUrl": "https://checkout.stripe.com/…", "sessionId": "…", "plan": "premium", "interval": "monthly", "priceId": "…" }
```

Open `checkoutUrl` in an in-app browser / `url_launcher`. `successUrl` /
`cancelUrl` default to the request's `Origin` header or `APP_BASE_URL` —
**from a native app you should always pass explicit `successUrl`/`cancelUrl`**
(e.g. a custom URL scheme the app can intercept) rather than relying on the
fallback, since a mobile client has no meaningful browser Origin.

### 7.2 `POST /api/v1/billing/portal`

```json
{ "returnUrl": "optional" }
```

Returns `{ "portalUrl": "https://billing.stripe.com/…" }` — a hosted page
where an already-subscribed user updates their card or cancels.
`400 "No billing account yet — subscribe first."` if they've never checked
out. Same note on `returnUrl` as above — pass one explicitly from mobile.

### 7.3 `POST /api/v1/billing/verify-receipt` — **not implemented yet**

```json
{ "platform": "ios | android", "receipt": "string", "productId": "string" }
```

**This currently always returns `501`.** The interface exists
(`src/lib/billing/receipt-validation.ts`) but nothing validates against
Apple/Google yet — every call throws "not implemented." **Do not build
against this expecting it to work** until the backend team confirms it's
live. In-app purchase entitlements are not wired up; Stripe Checkout (§7.1)
is the only working purchase path today, which means the mobile app likely
needs to send users to a web checkout flow rather than native IAP for now —
confirm the intended purchase flow with the backend owner before shipping a
store listing that implies native IAP.

---

## 8. Direct Supabase access (no API wrapper needed)

These tables are Row-Level-Security-scoped to `auth.uid()`, with no database
triggers, so the mobile app **may** read them directly via the Supabase
Flutter SDK instead of an HTTP round trip — useful for a fast local refresh.
Everything here is also available through an `/api/v1` endpoint (§3); use
whichever is more convenient for reads. **For writes, follow the "one
caveat" note below.**

| Table | Direct access | Notes |
|---|---|---|
| `profiles` | select / update | one row per user |
| `user_profiles` | select / upsert | free-text intro / goals / stressors |
| `mood_logs` | select / insert | insert with `is_baseline: false` — only onboarding sets `true` |
| `habits` | select / insert / update / delete | user-owned |
| `habit_logs` | select / insert* | user-owned; upsert on `(habit_id, log_date)` |
| `exercises` | select | read-only catalogue |
| `exercise_completions` | select / insert* | user-owned |
| `screener_responses` | **select only** | writes MUST go through `POST /api/v1/screeners/:type/responses` — a direct insert skips the PHQ-9 item-9 crisis escalation |
| `chat_threads` / `chat_messages` | **select only** | sending MUST go through `POST /api/v1/chat/messages` — a direct insert skips the crisis gate and rate limiter |

\* **The one caveat.** A direct SDK insert into `habit_logs` /
`exercise_completions` stores the row correctly, but the `/api/v1` endpoints
(`PATCH /api/v1/habits`, `POST /api/v1/exercises`) also do two extra things a
direct insert won't: (1) an optional follow-up mood log, and (2) a short
"activity card + companion reaction" posted into the person's active chat
thread (streak-aware). Neither is required for correctness — Insights
screens work fine either way — it's purely the in-chat encouragement loop.
**Prefer the `/api/v1` endpoints for writes** unless you specifically want to
skip that side effect.

---

## 9. Screeners (PHQ-9 / GAD-7)

There is **no endpoint that returns the question text** — hardcode these
(they're the standard, public-domain instruments) in the same order the
`responses` array must use:

**PHQ-9** (9 items, prompt: *"Over the last 2 weeks, how often have you been
bothered by any of the following?"*):

1. Little interest or pleasure in doing things
2. Feeling down, depressed, or hopeless
3. Trouble falling or staying asleep, or sleeping too much
4. Feeling tired or having little energy
5. Poor appetite or overeating
6. Feeling bad about yourself — or that you are a failure or have let yourself or your family down
7. Trouble concentrating on things, such as reading the newspaper or watching television
8. Moving or speaking so slowly that other people could have noticed — or the opposite, being fidgety or restless
9. Thoughts that you would be better off dead or of hurting yourself in some way

**GAD-7** (7 items, prompt: *"Over the last 2 weeks, how often have you been
bothered by the following?"*):

1. Feeling nervous, anxious, or on edge
2. Not being able to stop or control worrying
3. Worrying too much about different things
4. Trouble relaxing
5. Being so restless that it is hard to sit still
6. Becoming easily annoyed or irritable
7. Feeling afraid, as if something awful might happen

Each answer is `0` ("Not at all") · `1` ("Several days") · `2` ("More than
half the days") · `3` ("Nearly every day").

### `POST /api/v1/screeners/:type/responses` (`:type` = `phq9` | `gad7`)

```json
{ "responses": [0, 1, 2, 0, 1, 0, 0, 0, 0] }
```

Exactly 9 ints for `phq9`, 7 for `gad7`, each `0–3`.

```json
{
  "id": "uuid", "total_score": 4, "severity": "mild",
  "taken_at": "ISO-8601",
  "crisisTriggered": false,
  "crisis": null
}
```

**Critical: PHQ-9 item 9 (index 8, "thoughts of hurting yourself") escalates
independently of total score.** Any answer ≥ 1 on that item sets
`crisisTriggered: true` and populates `crisis` with the same structured
object as a chat crisis reply (`{ type, severity, message, matched,
resources, disclaimer }`) — **show the crisis UI immediately when
`crisisTriggered` is true**, regardless of how low the total score is. This
is unaffected by the "critical only" note in §5.1 — screener escalation is a
separate, deliberately more sensitive path.

`GET /api/v1/screeners` (no path param) returns due-dates + history for both
instruments in one call:

```json
{ "screeners": [
  { "type": "phq9", "label": "PHQ-9 (low mood)", "latest": { /* or null */ },
    "due": true, "dueAt": "ISO-8601 | null", "history": [ /* past responses */ ] },
  { "type": "gad7", "...": "..." }
] }
```

`POST /api/v1/screeners` also accepts `{ "screener_type": "phq9"|"gad7", "responses": [...] }`
as an alternative to the path-based endpoint above — same underlying logic,
same response shape. Either is fine; the path-based one is what's documented
and tested most thoroughly, so prefer it for new code.

---

## 10. Mood, habits, exercises, preferences

Straightforward CRUD-shaped wrappers — request/response bodies below.

### `POST /api/v1/mood`
```json
{ "score": 1, "note": "optional, ≤500 chars", "tags": ["optional", "≤10 items"] }
```
→ `{ "ok": true }`

### `GET /api/v1/habits`
→ `{ "habits": [...], "logs": [...last 30 days...], "today": "YYYY-MM-DD" }`

### `POST /api/v1/habits`
```json
{ "name": "string, 1-80 chars", "category": "optional", "frequency_target": 7 }
```
→ the created habit row.

### `PATCH /api/v1/habits`
```json
{ "habit_id": "uuid", "log_date": "YYYY-MM-DD, optional (defaults today)", "completed": true, "note": "optional" }
```
`completed: false` deletes that day's log (un-checking). → `{ "ok": true, "completed": true|false, "thread_id": "uuid | null" }`.

### `GET /api/v1/exercises`
→ `{ "exercises": [ { id, slug, title, category, intro_text, steps, estimated_minutes } ], "completions": [...last 30...] }`
Filtered server-side to age-appropriate content based on `account_type`.

### `POST /api/v1/exercises`
```json
{ "exercise_id": "uuid", "mood_before": 3, "mood_after": 4, "response_data": {}, "log_mood_after": true, "thread_id": "optional" }
```
→ `{ "ok": true, "id": "uuid", "thread_id": "uuid | null" }`

### `GET /api/v1/preferences`
→ `{ "companionPersona": "warm|direct|reflective", "theme": "system|light|dark", "language": "en|ar|fr" }`

### `PATCH /api/v1/preferences`
```json
{ "companionPersona": "direct", "theme": "dark" }
```
At least one field required. → the full updated `Preferences` object.

### `GET /api/v1/personas` — **public, no auth**
→ `[ { "id": "warm", "description": "Gentle and validating. The default." }, ... ]`

---

## 11. Data export & account deletion

### `GET /api/v1/export`

A therapist-shareable plain-text report.

```json
{ "filename": "kalm-report-2026-09-16.txt", "content": "KALM WELLNESS REPORT\n…" }
```

Save/share `content` as a `.txt` file (e.g. via `share_plus`).

### `DELETE /api/v1/export`

**Wipes wellness data — does NOT delete the account.** Clears mood logs and
the free-text intro/goals/stressors. The person can keep using the app
afterward with a clean slate. → `{ "ok": true }`.

### `DELETE /api/v1/account`

**The point of no return.** Full, irreversible account deletion — cancels
any Stripe subscription, erases wellness data, anonymizes crisis records,
then deletes the auth user (cascades everything else). Required by Apple App
Store Review Guideline 5.1.1(v): an app that supports account creation must
let the person delete it from inside the app.

**There is no confirmation step on the server** — the client must get
explicit, unambiguous confirmation (e.g. a type-to-confirm dialog, matching
the web app's own settings page) before calling this. → `{ "ok": true }`.
After this succeeds, sign the local session out and clear any cached data.

---

## 12. Voice calls (Pro / Premium only)

More involved than the rest — a live, streamed voice conversation over
WebRTC via OpenAI's Realtime API. Budget extra implementation time if you
take this on; it needs a WebRTC client, not just HTTP.

### `POST /api/v1/calls/sessions`

```json
{ "thread_id": "optional — attaches the call transcript to an existing chat thread", "voice": "optional voice id" }
```

**Gating, in order:** `402` if the tier has 0 weekly calls (free), `429` if
the weekly allowance is used up (`"Your next call is available on <day>. I'm
still here in chat any time."`), `403` if a teen account is waiting on
guardian consent, `409` if a call is already active, `503` if voice isn't
configured on the server yet.

**Response `201`:**

```json
{
  "session": { "id": "uuid", "thread_id": "uuid", "status": "active", "...": "..." },
  "realtime": {
    "provider": "openai_realtime", "model": "…", "voice": "…",
    "client_secret": "short-lived — safe to use from the device",
    "expires_at": 1234567890,
    "webrtc_url": "…"
  }
}
```

Use `client_secret` + `webrtc_url` to open the WebRTC connection directly
from the device to OpenAI's Realtime API — the backend is not in the media
path after this call.

### `POST /api/v1/calls/sessions/:id/turns`

Call this after each spoken exchange to record the turn and run crisis
detection on it:

```json
{ "role": "user | assistant", "text": "transcribed speech" }
```

```json
{ "turn_count": 4, "crisis": null }
```

**`crisis` non-null means stop the call immediately and show the crisis
response** — the safety record and admin alert are already handled
server-side by the time you get this response.

### `POST /api/v1/calls/sessions/:id/end`

```json
{ "end_reason": "optional, ≤60 chars" }
```

→ the finalized session row (duration, turn count, summary).

### `GET /api/v1/calls/sessions?limit=`

→ `{ "sessions": [ { id, thread_id, status, provider, model, voice, started_at, ended_at, duration_seconds, turn_count, summary, crisis_triggered, crisis_severity, end_reason } ] }`
(`limit` optional, default 20, max 50.)

---

## 13. Push notifications

FCM (Firebase Cloud Messaging) — one integration covers both iOS and
Android, so the Flutter side only needs `firebase_messaging`.

**Mobile side's entire job:**

1. Ask the OS for notification permission.
2. `FirebaseMessaging.instance.getToken()`.
3. `POST /api/v1/push/register-token`:
   ```json
   { "platform": "ios | android", "token": "the FCM token" }
   ```
   → `{ "ok": true }`
4. Call it again whenever `FirebaseMessaging.instance.onTokenRefresh` fires —
   FCM tokens rotate.
5. `DELETE /api/v1/push/register-token` with `{ "token": "…" }` on sign-out,
   so a signed-out device stops receiving another user's notifications.

Everything past registration (deciding when to send, building the payload,
actually calling FCM) is entirely server-side. **Note:** sending is
currently a no-op on the server until `FCM_SERVICE_ACCOUNT_JSON` is
configured — registering a token will succeed, but don't expect actual
notifications to arrive until the backend owner confirms that's set.

---

## 14. Endpoints that exist but are not for the member-facing app

`GET /api/v1/admin/users/:userId/cost` — internal cost-reporting for
admins/super-admins only (`403` for anyone else). Never call this from the
regular member app.

---

## 15. Known gaps to flag before you build against them

- **In-app purchase verification is not implemented** (§7.3) — plan the
  purchase flow around Stripe Checkout / the customer portal for now.
- **Push sending requires server-side FCM config** that may not be set yet
  (§13) — registration works regardless, delivery may not.
- **No CORS headers** on `/api/v1/*` — fine for native builds, a blocker for
  Flutter Web until added.
- **No API versioning/deprecation headers** — this is "v1" in name only so
  far; coordinate directly with the backend owner before any breaking change
  ships.
- Two older docs (`docs/MOBILE_API.md`'s previous version and
  `docs/API_V1.md`) are now superseded by this file and were inconsistent
  with each other and with the actual code (missing streaming chat, voice
  calls, push tokens, billing portal, and account deletion; incorrectly
  listed "pro" as absent from the tier enum; incorrectly claimed
  mood/habits/exercises were SDK-only). If you see either referenced
  elsewhere, this file wins.
