# Safety upgrade: plans, human handoff, AI reminders, teen consent

Four additions, all inside the existing safety system rather than beside it.

## 1. Personal safety plan

A member-owned crisis plan they build in calm moments and can reach instantly in hard ones.

Sections (all optional, free text + list items):
- My warning signs
- What helps me settle
- People I can reach (name + how to contact)
- Professionals / lines
- Making my space safer
- My reason to stay

Where it appears:
- New page under the member area, reachable from the sidebar and from the Immediate support card.
- When crisis language is detected in chat, the support card gains an "Open my safety plan" button. If they have no plan yet, the same button offers to start one, gently and optionally.
- The companion is told a plan exists (and its warning signs / coping steps, only if they consented to AI context) so it can reference their own words back to them.
- Included in data export and wiped by account deletion.

## 2. Connect to a human now

- A persistent "Talk to a human" button in the chat header, plus a prominent one inside the crisis card whenever a moment is flagged.
- Pressing it creates a **human support request**: status queued, the flagged severity, and an AI-written short summary of what is going on (last few turns condensed, no raw transcript dump beyond what the reviewer needs), plus their preferred name, language, and time zone.
- The member sees an immediate acknowledgement: request received, someone will reply here, and the crisis lines stay visible while they wait — never a spinner that implies a human is already reading.
- Admin panel gets a **Human support** queue: newest and most urgent first, claim / respond / close, with a live unclaimed count badge in the admin nav so it works as a 24/7 desk. Replies land back in the member's chat as clearly-labelled human messages ("Kalm team", not the companion).
- Every request also fires the existing admin alert email, and joins the existing 30-minute unreviewed escalation sweep.

## 3. AI-disclosure reminders in voice calls

- At call start, a spoken and on-screen line: this is an AI companion, not a person or a therapist.
- Repeated every 5 minutes mid-call as a brief on-screen banner plus a short spoken reminder, and again at the 25-minute mark before the 30-minute cutoff.
- A permanent small on-screen label for the whole call.
- Localized in English, French, Arabic.

## 4. Parental consent for 13-17

- When the server computes an age under 18 during onboarding, the account enters `awaiting_guardian_consent` instead of going straight to chat.
- The teen enters a parent/guardian email. We send that guardian a consent request explaining plainly what Kalm is, what it is not, what data is kept, and how to withdraw consent.
- The guardian approves through a signed one-time link (no account needed). We store who consented, when, from what email, and the IP, as the audit record.
- Until consent lands, the teen sees a waiting screen with full crisis resources available — safety is never gated — but no companion chat or voice calls.
- Guardians can withdraw consent later through the same link, which returns the account to the waiting state.
- Consent state is visible in the admin user detail view.

## Technical notes

- New tables: `safety_plans` (one per user, owner-only RLS), `human_support_requests` + `human_support_messages` (member reads own, admins read all), `guardian_consents` (service-role writes, member reads own). GRANTs and policies with every table.
- Server functions in `src/lib/safety-plan.functions.ts`, `src/lib/human-handoff.functions.ts`, `src/lib/guardian-consent.functions.ts`; admin-side reads in matching `.server.ts` helpers, mirroring the existing support/crisis split.
- Handoff summary generated through the existing OpenRouter helper, failing open to a plain "no summary available" so the request always reaches the queue.
- Guardian consent link: signed token route under `src/routes/api/public/*` for the approval action, with a public confirmation page.
- Crisis-gate ordering guarantee is preserved; handoff requests are created after the gate, never in place of it.
- Emails reuse the existing Resend paths (`crisis-alert.server.ts`, `support.server.ts` patterns).
- `docs/PROJECT_OVERVIEW.md` and `roadmap.md` updated in the same change.

## Open choices (defaults above unless you say otherwise)

- Human replies land in the member's existing chat thread, labelled as the Kalm team. The alternative is a separate "Talk to a human" thread.
- Guardian consent is email-link based. Stronger verification (card check, ID) exists but is heavier and usually unnecessary for this risk tier.
