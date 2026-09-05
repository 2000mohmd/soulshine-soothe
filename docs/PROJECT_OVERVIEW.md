# Kalm — Project Documentation

An AI mental wellness companion. Lovable hosts the backend + a full web reference UI;
a separate mobile app is intended to consume the same backend later.

- Preview: https://id-preview--3ccb18b6-d5dd-414d-a598-ddc4028d95df.lovable.app
- Published: https://inner-reach-buddy.lovable.app

## 1. Product principles

1. Wellness support, **not** therapy or emergency care. Disclaimer is visible on the
   landing page, in chat, and on legal/crisis pages.
2. Every AI input path passes a **deterministic crisis gate before** any model call.
3. Privacy first: explicit consent flags, data export/delete, no dark patterns.
4. Tone: warm, validating, non-clinical; never guilt-based nudging.

## 2. Tech stack

| Layer         | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework     | TanStack Start v1 (React 19, Vite), file-based routing in `src/routes`                                                                                                                                                                                                                                                                                                                                                                                                     |
| Server logic  | `createServerFn` RPC in `src/lib/*.functions.ts`; server-only helpers in `*.server.ts`                                                                                                                                                                                                                                                                                                                                                                                     |
| Backend       | Lovable Cloud (Supabase): Postgres + RLS, Auth (email/password, email magic link, Google, Apple)                                                                                                                                                                                                                                                                                                                                                                           |
| Data fetching | TanStack Query                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Styling       | Tailwind v4 tokens in `src/styles.css` (Soft Glass lavender/blue-violet oklch palette, frosted surfaces, Fraunces + Nunito Sans)                                                                                                                                                                                                                                                                                                                                          |
| Branding      | Shared `KalmLogo` abstract four-petal bloom used across landing, auth, onboarding, chat, and the collapsible member rail                                                                                                                                                                                                                                                                                                                                                   |
| UI kit        | shadcn/ui + Radix, lucide icons, recharts, sonner                                                                                                                                                                                                                                                                                                                                                                                                                          |
| LLM           | Provider layer in `src/lib/llm-provider.server.ts`: **OpenRouter only** (`OPENROUTER_API_KEY`, OpenAI-compatible) serving `anthropic/claude-sonnet-4.5` (companion, summaries, digests) and `anthropic/claude-haiku-4.5` (crisis classifier). Native tool use, streaming supported. No Lovable AI gateway, no direct Anthropic API call. Speech-to-text also goes through OpenRouter (`google/gemini-2.5-flash` audio input). |
| Runtime       | Cloudflare Worker (edge); no Node-only packages                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 3. Routes

Public: `/` (landing), `/auth`, `/crisis` (never gated), `/legal`.

Authenticated (`src/routes/_authenticated/`, guarded by `route.tsx`):

| Route        | Purpose                                                    |
| ------------ | ---------------------------------------------------------- |
| `onboarding` | Consent → account mode → self-introduction → baseline mood |
| `dashboard`  | Today's check-in, mood trend, nudge feed, "where to next"  |
| `chat`       | AI companion; threads, quick actions, inline tool actions  |
| `habits`     | Habit CRUD, 7-day grid, habit↔mood insights                |
| `exercises`  | Library + interactive step player with mood before/after   |
| `check-ins`  | PHQ-9 / GAD-7 with severity bands and score history        |
| `care`       | Step-up-to-professional-care resources                     |
| `settings`   | Profile review, data deletion                              |

API: `src/routes/api/public/hooks/evaluate-nudges.ts` — cron/webhook nudge sweep.

## 4. Data model (Postgres, all RLS-scoped to `auth.uid()`)

- `profiles` — preferred_name, `account_type` (general | condition | teen | org_member),
  `subscription_tier` (free | pro | premium | org), Stripe billing fields
  (`stripe_customer_id`, `stripe_subscription_id`, `stripe_subscription_status`,
  `stripe_price_id`, `stripe_billing_interval`, `subscription_current_period_end`), org_id, consent flags, onboarding_completed.
- `user_profiles` — self-introduction: intro_text, goals[], stressors[],
  existing_diagnosis, communication_preference, topics_to_avoid, in_professional_care.
- `mood_logs` — score 1-5, note, tags[], is_baseline.
- `habits` / `habit_logs` — user habits + per-day completion.
- `chat_threads` / `chat_messages` — sender (user | assistant | system), content,
  `flagged_crisis`, `quick_action`.
- `crisis_events` — matched_terms, severity, reviewed. Admin-readable via `has_role()`.
- `exercises` (read-only, seeded) / `exercise_completions` — mood_before/after, response_data jsonb.
- `screener_responses` — phq9 | gad7, responses jsonb, total_score, severity.
- `nudges` — trigger_type, message, suggested_exercise_slug, resource_ids[], dismissed_at, acted_on.
- `care_resources` (public read of active rows) — directory | low_cost | employer_eap | crisis.
- `commitments` — description, source (chat | exercise), status (pending | done | skipped), due_at.
- `effectiveness_insights` — per-user subject → avg_mood_delta, sample_size, confidence.
- `user_roles` + `has_role(uuid, app_role)` security-definer fn (roles never on profiles).

Seeded exercise slugs: `cbt-thought-record`, `behavioral-activation`, `grounding-54321`,
`box-breathing`, `worry-time`.

## 5. AI architecture

Flow for a chat message (`src/lib/chat.functions.ts` → `sendMessage`):

```text
user message
  └─> detectCrisis()  (regex, src/lib/crisis.ts)   ← NON-NEGOTIABLE, runs first
        ├─ flagged: mark flagged_crisis, log crisis_events, return crisis response
        │           object (calm copy + 988 / Crisis Text Line resources). No LLM call.
        └─ clear:  generateCompanionReply()  (src/lib/ai-companion.server.ts)
                     ├─ buildSystemPrompt(ctx)  — persona, session behavior,
                     │    anti-dependency instruction, disclaimer
                     ├─ context injected: user_profiles intro, recent mood_logs,
                     │    recent thread history, quick_action variant
                     └─ Anthropic tool-use loop (max 3 iterations)
```

Tools (`src/lib/companion-tools.server.ts`): `log_mood`, `create_commitment`,
`get_effectiveness_insights`, `launch_exercise`, `suggest_stepup`,
`get_exercise_steps`, `complete_exercise_in_chat`. Executed results surface in the
transcript as visible actions (e.g. "logged your mood as 4/5"). Nudges use a
read-only subset (`NUDGE_TOOLS`).

Proactive coaching (`src/lib/nudges.server.ts`), one nudge per trigger with a 7-day cooldown:

- `low_mood_streak` — 5+ consecutive days averaging < 3/5 → behavioral activation.
- `inactivity` — 4+ days silent after regular use → low-pressure care message.
- `screener_step_up` — moderate+ severity or 2+ band worsening → step-up copy + 2-3 care resources.

## 6. What's built vs. not

Built: Phases 1-3 (auth/onboarding/design system, tracking + chat + crisis middleware,
exercises + screeners + nudges + care pathway) and Phase 4.2/4.3 (Claude tool-calling,
session-like chat behavior, in-chat guided exercises, commitments, effectiveness insights).

Also built (billing + tiers): four tiers — free (8 messages/day, no voice),
pro (200/day, 1 voice call per rolling 7 days), premium (500/day ceiling marketed
as unlimited, 2 calls per 7 days), org (same ceilings as premium). Caps and the
call allowance have one source of truth in `src/lib/chat-limits.ts`, enforced by
the chat rate limiter and by `src/lib/call-session.server.ts` (over-limit call
attempts return 429 with the next available date). Stripe test products
"Calm AI Pro" ($18/mo, $180/yr) and "Calm AI Premium" ($50/mo, $500/yr) exist;
`POST /api/v1/billing/checkout` takes `{ plan, interval }`, and the Stripe
webhook derives both tier and interval from the subscription's price and stores
them on `profiles`. Per-call cost is written to
`call_sessions.estimated_cost_usd`, and `GET /api/v1/admin/users/:userId/cost`
(admin-only) reports tier, interval, chat cost, voice cost and combined cost.

Members compare and buy plans at `/plans` (`src/routes/_authenticated/plans.tsx`,
linked from the app rail as "Plans"): three cards, a monthly/yearly toggle, the
current-plan badge, today's message and weekly call usage, and a "Manage billing"
button that opens the Stripe Customer Portal. Web actions go through
`src/lib/billing.functions.ts`; the `/api/v1/billing/*` routes stay for mobile.

Still missing on billing: the Stripe Customer Portal must be configured in the
Stripe dashboard to allow switching across the four prices with proration.

Not built yet:

- **Workplace/org tier** — `org_id` and `employer_eap` placeholders exist; no
  `organizations` table, admin dashboard, aggregate analytics, or seat management.
- **Live avatar/voice sessions** — no `live_sessions` table, no provider chosen,
  no real-time transcript crisis checks.
- **Data export as PDF** — a downloadable report exists
  (`src/lib/data-export.functions.ts` → `buildMyReport`, surfaced in
  `YourDataSection`), but as plain **.txt**, not the therapist-shareable **PDF**
  originally scoped.
- **Per-type email preferences** — proactive email (nudges + weekly digest) now
  sends via Resend with a single `profiles.email_opt_out` boolean + a working
  `/api/public/unsubscribe` route; a per-notification-type preferences screen is
  still a follow-up. Post-crisis follow-up exists but ships **off** behind
  `POST_CRISIS_FOLLOWUP_ENABLED`.
- **Regional care content + a precise location signal** — `care_resources` are
  now region-filtered, but by an interim heuristic keyed off the person's app
  language (`src/lib/care-region.ts`). Deliberately NOT upgrading to a country
  field yet: the dataset is US-only + 2 universal fallbacks, so a precise signal
  buys nothing until `care_resources` rows exist for other countries. When they
  do, add `request.cf.country` (Cloudflare Worker, no onboarding friction) at the
  same time.

Recently built (was on this list):

- **Voice notes** — the chat mic records, converts to mono 16 kHz WAV in the
  browser, and transcribes server-side through OpenRouter (Gemini audio input).
  OpenRouter is the only provider; with no credits the user sees a "needs
  credits" message instead of a silent failure.

- **Tier-aware message caps** — see "Billing / payments" above.

- **Effectiveness engine scheduling** — `computeEffectivenessFor` now runs in the
  pg_cron sweep and via an `effectiveness_recompute` job enqueued on exercise
  completion; the `get_effectiveness_insights` tool is a plain RLS-scoped read
  (the on-demand admin recompute was removed).
- **Commitment follow-up loop** — `commitment_follow_up` nudge trigger + a
  `complete_commitment` companion tool; open commitments flow into the chat
  context.
- **Localization** — member-facing screens are EN/AR/FR; crisis resources are
  localized (`crisisCopy()` — AR/FR drop US-only lines); `care_resources.region`
  is now filtered (see "Precise region signal" above).
- **Mobile API** — versioned HTTP surface under `src/routes/api/v1/*` with a
  bearer-token auth bridge (`src/lib/api-auth.server.ts`); full contract in
  `docs/MOBILE_API.md`.
- **Passwordless email sign-in** — `/auth` now offers a magic-link option
  (`supabase.auth.signInWithOtp`, redirects back to `/auth`) alongside the
  password form, on both the sign-up and sign-in tabs. This is the web
  implementation only; a native mobile client (e.g. the Flutter app) still
  needs its own deep-link handler registered for the redirect URL to catch the
  link and hand the session to the Supabase SDK.

## 7. Known risks / review areas for an outside reviewer

1. Crisis detection is **two-tier** (`src/lib/crisis-gate.server.ts` → `runCrisisGate`):
   a deterministic regex gate (`triageCrisis`, tiered critical/high/moderate severity,
   EN + AR + FR patterns) that always runs first, then a semantic LLM backstop
   (`classifyCrisisRisk`, Claude Haiku) that runs only when the regex gate is clear and
   catches implicit or coded phrasing. The backstop fails **open** on error, except it
   fails **safe** — surfacing crisis support — when it is unavailable on a non-English
   message, where the regex net is weaker. A session-level drift sweep
   (`classifySessionDrift`) re-reads the whole transcript when a thread is summarized,
   for risk that builds gradually across turns.
   Real remaining gap (item 6): the `ar` / `fr` crisis copy localizes the message and
   disclaimer, but the resource lines (988, Crisis Text Line 741741) are still
   US-specific — only `findahelpline.com` is region-agnostic. Regex recall on heavy
   sarcasm and untested locales is still the weak spot.
2. Crisis review workflow: `crisis_events.reviewed` is worked through the admin
   crisis queue (`src/routes/_authenticated/admin/crisis.tsx`, unreviewed-first),
   and every flag fires an admin email via `src/lib/crisis-alert.server.ts` with a
   30-minute re-escalation for anything still unreviewed. Remaining gap is
   coverage/SLA monitoring, not the absence of a workflow.
3. Teen mode: onboarding now collects a real date of birth
   (`profiles.date_of_birth`) and `completeOnboarding` computes age server-side —
   under 13 is rejected outright, under 18 is locked to `account_type = 'teen'`
   regardless of the client's selection, and `age_confirmed_13_plus` is the actual
   boolean result, not a hardcoded `true`. Real gap now: no parental-consent flow
   for 13-17-year-olds (COPPA/GDPR-K).
4. Cost/abuse: `src/lib/rate-limit/` enforces a per-user sliding window (20
   msgs/10 min) and a daily cap on chat, plus a token/estimated-cost counter
   (`chat_usage`) surfaced via `getChatUsage`. Postgres-backed for now; a
   Cloudflare rate-limiting binding is the planned transport when primary write
   load justifies it.
5. Model reliability: tool-use loop caps at 3 iterations then returns partial text;
   failure modes surface as generic fallback copy.
6. PHQ-9 item 9 (self-harm ideation) has its own escalation path in
   `src/lib/screeners.server.ts`: any non-zero answer builds a crisis response and
   logs a `crisis_events` row (`source: 'phq9_item9'`, severity moderate/high by
   the answer), independent of the total score.
7. `effectiveness_insights` reads use an admin (RLS-bypassing) client inside a tool —
   worth an access review.
8. Automated tests exist (`vitest`, run in CI on every push/PR) but are narrow:
   16 tests, all in `src/lib/crisis-gate.test.ts` (regex severity tiers, the
   ordering guarantee, the semantic-classifier fail-safe, localized resources).
   Nothing covers the rate limiter, the job queue, chat flow, or server
   functions outside crisis handling — verification there is still manual.
9. Privacy posture is consent-flag based; no encryption-at-rest beyond Postgres
   defaults, no retention/TTL policy on chat transcripts.

## 8. Conventions to respect when changing code

- Never edit `src/integrations/supabase/*` generated files or `src/routeTree.gen.ts`.
- Every new public table needs `GRANT`s + RLS policies in the same migration.
- Colors/shadows come from semantic tokens in `src/styles.css`; no hardcoded hex or
  `text-white`-style utilities.
- Protected server functions use `.middleware([requireSupabaseAuth])` and must not be
  called from public-route loaders.
- The crisis gate runs first, always, regardless of model or architecture changes.

## Admin roles and bootstrap (Phase 12)

Two tiers live in `user_roles` (`app_role` enum):

- `admin` — day-to-day admin work: crisis review, support replies, Users and
  Overview pages. An admin cannot grant roles.
- `super_admin` — required for role management (Team page, Phase 13). Keeping
  role-granting separate means an admin cannot escalate themselves or others.

There is deliberately **no UI path** to create the first `super_admin` (that
would be a privilege-escalation route). Bootstrap it with a direct database
write, once, replacing the email:

```sql
insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users where email = 'you@example.com'
on conflict (user_id, role) do nothing;
```

### Admin audit log

`admin_audit_log` records privileged actions: `viewed_user`,
`resolved_crisis_event`, `replied_support_ticket`, `granted_role`, and
`revoked_role`. Entries are append-only — admins can read and insert their own
rows only. Visible at `/admin/audit`, filterable by admin and action.

## Team & role management (Phase 13)

`/admin/team` is gated at the **server-function** level (`assertSuperAdmin` in
`src/lib/admin-support.functions.ts`), not just hidden in the nav: a plain
`admin` calling `listTeam` / `changeUserRole` gets `Forbidden`. Grants and
revokes run through the service role (`src/lib/admin-team.server.ts`) because
`user_roles` is read-only for authenticated users, always behind an extra
confirmation dialog (worded more strongly for `super_admin`), and always
audit-logged. Revoking the last `super_admin` is refused so the app can't be
locked out.

## Support channel (Phase 13)

Deliberately separate from `crisis_events` and `chat_messages` — this is
account/product support, not a mental-health path. The companion and the crisis
flow remain the routes for anything emotional or safety-related, and the member
UI links to `/care` for urgent needs.

- `support_threads` (subject, status `open` | `in_progress` | `resolved`) and
  `support_messages` (`sender` = `user` | `admin`). RLS: members read/write only
  their own threads; admins read all, reply, and set status. No deletes.
- Member UI: `/support` (entry point in Settings) — start a thread, read admin
  replies, reply back. `?thread=<id>` deep-links a conversation, which is the
  link used in notification emails.
- Admin UI: `/admin/support` — open-first inbox with member name, latest
  message preview, status and `updated_at`; thread detail with reply box and
  status control.
- On an admin reply: message insert → status bump (`open` → `in_progress`
  unless explicitly set) → Resend email to the member's account email with a
  short excerpt plus a link back (never the full reply) →
  `replied_support_ticket` audit entry. Email failure never blocks the reply.
