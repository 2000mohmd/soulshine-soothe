# Chat as a continuous virtual mental-health coach

Several pieces already exist and just need to be switched on or tightened. All changes stay inside the chat page — no new member pages.

## 1. Coach reaches out when the person is away
- A "haven't heard from you" check-in already exists, but it is turned off. Turn it on.
- Rhythm: first message after ~12 hours of silence, then at most one per day. If they still don't reply after 3 check-ins, stop until they come back. No messages overnight in their own timezone (22:00–08:00).
- The message is personal: it uses their name, their care plan, and what they last talked about, and ends with one simple question.
- It shows up in their single conversation. It is also sent by push notification on the phone app, and by email when push isn't set up (email only once every 3 days at most, and they can unsubscribe).

## 2. Coach-style replies, not question-and-answer
- Make the companion's instructions stronger: every emotional or open reply ends with exactly one specific follow-up question that moves things forward, keeps track of the goal they're working on, and checks back on earlier commitments ("Last time you planned to walk after work — how did it go?").
- Direct factual questions still get a straight answer first, then a short coaching question.
- When they're clearly saying goodbye, let it close warmly with no extra question.

## 3. Daily limit reached: invite them to upgrade
- Replace the current limit notice with a warm coach message: "We've reached today's limit on your plan. Upgrade so we can keep going together — or I'll be here again at [time]." Includes an "Upgrade my plan" button to the existing Plans screen and shows when the limit resets.
- Paid members who hit the limit see "Change plan" instead.
- Crisis help and human support always stay available, even when the limit is reached.
- English, French and Arabic.

## 4. One ongoing conversation that remembers everything
- Remove the conversation list, "New conversation" and delete buttons. Each person has one continuous conversation.
- Existing members with several old conversations: all their old messages are merged into one conversation, in the order they were sent. Nothing is deleted.
- Scrolling up loads earlier messages.
- Memory: the coach always gets the latest messages word-for-word, plus a running summary of everything before them (built from the existing summaries), their profile, care plan, moods, habits and commitments. Old details are not lost when the conversation gets long.

## 5. Asking for help switches to a human coach
- When the person asks for a real person ("can I talk to someone", "I need a human", "I need help" with distress), the AI gently offers a human coach. It confirms in one line and creates the human support request with a summary, using the existing human support system, then switches the chat to the human support view.
- If the crisis check has already fired, the request is created straight away and marked urgent. Emergency numbers are still shown.
- The "Connect to a human" button stays as a manual option.
- The coach never pretends to be a human; the switch is clearly labeled.

## Technical details
- `chat-checkin.server.ts`: turn it on by default (`CHAT_CHECKIN_ENABLED` defaults to true, kept as an off switch). Add the stop-after-3 rule, quiet hours from the profile timezone, and push via `push.server.ts` with an email fallback through `proactive-email.server.ts` (unsubscribe link included). The existing nudge sweep cron calls it.
- `ai-companion.server.ts`: tighten the HOW YOU TALK section and add a "coaching continuity" section that uses `openCommitments` and the last session summary.
- New companion tool `request_human_support` in `companion-tools.server.ts` that calls `createHandoffRequest` from `human-handoff.server.ts`. It returns an action so the chat UI switches `viewMode` to human. A lightweight phrase check in `prepareChatTurn` sets crisis severity to urgent.
- Single conversation: add `getOrCreatePrimaryThread`. A migration moves each user's `chat_messages`, summaries and handoff references into their newest thread and deletes the empty old threads. Add a unique partial index (one thread per user) and update `createThread` to return the existing one. Leave `/api/v1/chat/threads` returning one item so the mobile apps keep working.
- `chat.tsx`: remove the thread sidebar and use `getThreadMessagesPageCore` for infinite scroll upward. Turn the `rate_limit` card into an upgrade card with tier-aware wording; `limit` metadata is already returned.
- History: keep the last 20 messages word-for-word and add a rolling "long-term memory" summary to `CompanionContext`, refreshed by the existing `summarize_thread` job every N messages instead of per new thread.
- Add i18n strings in en/fr/ar. Update `docs/PROJECT_OVERVIEW.md`, `docs/MOBILE_API.md` (single thread) and `roadmap.md`, plus tests for the single-thread merge, the human-support tool and the limit card.
