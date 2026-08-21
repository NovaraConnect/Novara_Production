# 01 — Product Overview

## What Novara is

Novara is a personal relationship-management tool ("a personal CRM") for tracking professional
contacts and making sure important relationships don't go cold. This description is grounded
directly in the product's own marketing copy, present in the repository at
`artifacts/project-novara/src/pages/Home.tsx`:

> "Never let an important relationship go cold." / "Your personal relationship CRM for ambitious
> professionals. Stay in touch with the people who matter."

The repo-root `ARCHITECTURE.md` independently describes it the same way: "a personal-CRM style app
for tracking professional contacts and follow-ups."

## The problem it solves

Professionals meet people worth staying in touch with — at conferences, through introductions, in
new jobs — and then lose track of them. Novara's core loop, inferred directly from the feature set
implemented in the repository, is:

1. Add a contact (manually, or by importing a LinkedIn profile URL — see `routes/linkedin.ts`).
2. Novara assigns the contact a priority (High/Medium/Low) and a follow-up cadence.
3. Novara surfaces who's due or overdue for a follow-up (`next_follow_up_date` on `contacts`,
   computed dashboards, and — when configured — push notifications from the daily scheduler in
   `artifacts/api-server/src/lib/scheduler.ts`).
4. The user marks a contact as "contacted," which recalculates their next follow-up date
   (`POST /api/contacts/:id/mark-contacted`).
5. Relationships that go unanswered for long enough automatically downgrade to a longer, lower-
   priority cadence (`auto_downgrade_after_months` in `user_settings`, applied in the
   mark-contacted logic in `routes/contacts.ts`).

## Target audience

The homepage copy targets "ambitious professionals" specifically. The settings model
(`career_statement`, `career_goals`, `goal_tags` in `user_settings`, and the priority-scoring logic
in `lib/priority.ts` that weighs contacts against a user's stated career goals) confirms this is
built around *career-motivated* networking — the app actively reasons about whether a given
contact is relevant to what the user says they're trying to achieve professionally, not just
generic contact-list hygiene. The free-tier contact cap of 25 (`FREE_TIER_LIMIT` in
`routes/contacts.ts`) and the phrase "beta" in that route's own error message ("You've reached the
25-contact limit for the beta. More spots are coming soon!") indicate the product is, as of this
writing, in a beta/pilot phase rather than a fully commercial, unlimited product.

## Core philosophy (as evidenced by the code, not stated anywhere as a mission doc)

- **Priority is not fixed — it's computed, but overridable.** Every contact has a `base_priority`
  (set by the user directly) and a `current_priority` (computed by `calculatePriority()` in
  `lib/priority.ts` from how well the contact's company/role/industry/interests match the user's
  stated career goals). The user can freeze this at any time via `priority_override`. This reflects
  a design philosophy: the app tries to be smart about what matters, but never silently overrides
  a human's explicit judgment.
- **The app degrades gracefully rather than failing hard.** Missing `VAPID_*` keys silently
  disable push notifications (a warning log, not a crash). Missing `RESEND_API_KEY` silently skips
  the feedback-notification email, but the feedback submission itself is still saved. Missing
  `GNEWS_API_KEY` degrades the news route rather than 500ing. This "the core feature always works,
  optional integrations fail soft" pattern recurs throughout `artifacts/api-server/src`.
- **Diagnostics, not surveillance.** The feedback feature explicitly documents (in code comments
  in `routes/feedback.ts` and `Feedback.tsx`) that only the current route, browser user-agent
  string, and app version are captured for bug reports — "No secrets/tokens/cookies." This is a
  deliberate, stated boundary, not an oversight.

## MVP goals (as evidenced by what exists)

The implemented feature set — contact CRUD, priority scoring, follow-up cadence, LinkedIn import,
company news lookups, push notifications, and in-app feedback — represents what has actually been
built. There is no committed product roadmap document in the repository, so anything about future
scope beyond what's implemented would be speculation; this document does not speculate.

## What Novara intentionally is NOT

Based on what's absent from the codebase, not just what's present:

- **Not a team/organization tool.** Every table is scoped by a single `user_id` (Clerk user ID);
  there is no concept of shared contacts, teams, or organizations anywhere in the schema or API.
- **Not a messaging platform.** There is no in-app messaging, no contact-to-contact communication,
  and no way for two Novara users to interact with each other. The only outbound communication
  channel in the codebase is the feedback-notification email to the Novara team itself
  (`lib/email.ts`), not user-to-user or user-to-contact messaging.
- **Not (yet) a natively distributed mobile app.** `artifacts/novara-mobile` is an Expo/React
  Native client, but per `ARCHITECTURE.md` it is deployed as a static Expo Go bundle, not
  published to the App Store or Play Store — see `09-Deployment.md`.
- **Not free of a contact cap.** The 25-contact limit is a real, enforced constraint
  (`routes/contacts.ts`, `POST /contacts`), not a marketing suggestion.
- **Not a system with team billing or payments.** No payment processing, billing, or subscription
  code exists anywhere in the repository (also independently confirmed in `LAUNCH_READINESS_REPORT.md`).

## User experience philosophy

The frontend (`artifacts/project-novara`) is built as an installable Progressive Web App (PWA) —
see `vite.config.ts`'s `VitePWA` plugin config — with a mobile-first layout (`mobile-container`
class used throughout page components, `100dvh` viewport heights, a `BottomNav` component). The
product is designed to feel like a native mobile app reached by installing a web app to a home
screen, not a desktop-first web dashboard, even though it's also fully usable in a desktop browser.

## Product principles worth naming (inferred, and labeled as inferred)

These are patterns visible across many independent parts of the code, which is why they read as
principles rather than one-off decisions — but they are not written down anywhere in the repo as
an explicit list, so they're presented here as *inferred* rather than *stated*:

1. Compute smart defaults, but let the human override them (priority, cadence).
2. Never lose user data because an optional integration failed (email, push, news all fail soft).
3. Keep diagnostic data collection minimal and explicitly scoped (feedback route comments).
4. Ship a working core loop before broad platform coverage (web PWA is the primary, most complete
   client; mobile is a secondary, less-polished Expo Go experience per `ARCHITECTURE.md`).

For the non-technical, values-level version of this — the "why" behind the product that should
survive any future rewrite — see `../Founder-Vision.md`.
