# 05 — Business Rules

This is the document that explains what makes Novara behave the way it does, and why, wherever
"why" is recoverable from code comments or inferable from the implementation itself. Every rule
below is grounded in a specific file and, where possible, quotes the exact logic.

## 1. Priority calculation

**Where:** the ONE canonical source of truth is `lib/novara-priority`
(`@workspace/novara-priority`), `computeSuggestedPriority(contact, profile)`. The backend imports
it via `artifacts/api-server/src/lib/priority.ts` (a thin re-export); the web frontend imports it
via `artifacts/project-novara/src/lib/suggest.ts`; mobile imports it in `lib/utils.ts`. There is
**no second priority implementation** anywhere — the old bump/drop `calculatePriority()` and the
frontend `suggestImportance()` "generic high" heuristic have both been deleted.

Three stored fields model priority:

- `basePriority` — a user-editable field. **It is NOT an input to the AI suggestion** and never
  determines the suggested band (this was the root of the old "Base Priority determines Medium"
  bug).
- `currentPriority` — the **effective** priority that's shown/used: the AI suggestion when
  `priorityOverride` is false, or the frozen manual value when it's true.
- `priorityOverride` — true means the user manually set the priority; recalculation never touches it.

Conceptually: `effectivePriority = manualPriorityOverride ?? aiSuggestedPriority`
(`getEffectivePriority()`).

**The suggestion model** (`computeSuggestedPriority`) is deterministic and three-tier. Both the
profile and the contact are normalized identically (see rule 2), then four independent boolean
alignment signals are derived from the contact:

- `companyMatch` — contact company ↔ profile
- `roleMatch` — role / job title / function / seniority ↔ profile
- `industryMatch` — contact industry ↔ profile
- `contextMatch` — interests / tags / notes / relationship context ↔ profile

Banding (updated 2026-08-11 — company and industry are now treated as equally-valid
"specificity" signals; previously only company counted toward High):

- **High** = `roleMatch && (companyMatch || industryMatch)` — the kind of work you want, at
  either a company you named or in an industry you named.
- **Medium** = any single signal alone (role only, company only, industry only, or context
  only), but not the High combo.
- **Low** = no alignment signal at all.

**Worked examples** (profile: goal "beauty", statement "Sales at Estée Lauder"):

| Contact | Signals | Result |
|---|---|---|
| Sales at Estée Lauder | role + company | **High** |
| Sales at another beauty company | role + industry | **High** |
| Marketing at Estée Lauder | company only (role mismatch) | **Medium** |
| Beauty-industry decision maker | industry only | **Medium** |
| Product Manager at Tesla | none | **Low** |
| Investment-banking analyst | none | **Low** |

**Why this design changed:** the original company-only rule meant a user who wrote a broad
industry goal (e.g. "I want to work in sales in the beauty industry") could never get a
same-industry contact to High unless they also typed the exact company name into their goals —
confirmed live via a real user whose goals said "Beauty" and "Sales" but never the specific
company name, and whose matching contact stayed stuck at Medium as a result. Company and
industry are now both "specificity" signals of equal weight; role match plus either one is
High. Role-only, company-only, or industry-only alignment still lands in Medium — only the
combination is High.

## 2. Normalization

**Where:** `lib/novara-priority`, `normalizeText()` / `tokenize()`.

Identical normalization is applied to both profile and contact data: lowercase, Unicode **NFD**
decomposition, combining-mark stripping, punctuation→whitespace, whitespace collapse, and token
dedup. This is why `Estée Lauder` folds to `estee lauder` and matches a profile written either
way. Tokens are ≥3 chars and stop-word filtered. The career statement is fed directly into the
profile (no separate `extractKeywordsFromStatement` step — that duplicate has been removed);
`computeSuggestedPriority` tokenizes `careerGoals`, `careerStatement`, `goalTags`, `targetRoles`,
`targetIndustries`, and `targetCompanies` together.

## 3. Follow-up cadence

**Where:** cadence constants and derivation live in `lib/novara-priority`
(`SUGGESTED_CADENCE_DAYS`, `MANUAL_CADENCE_OPTIONS`, `deriveSuggestedCadence`,
`getEffectiveCadence`). Cadence is **never independently generated** — it is always derived from
the effective priority unless the user has manually overridden it.

Canonical automatic mapping:

| Priority | Recurring cadence |
|---|---|
| High | **21 days** (3 weeks) |
| Medium | **42 days** (6 weeks) |
| Low | **90 days** (3 months) |

Manual cadence options (`MANUAL_CADENCE_OPTIONS`): **21 / 30 / 42 / 60 / 90 / 180** days —
3 weeks, 1 month, 6 weeks, 2 months, 3 months, 6 months. Available everywhere cadence is editable.

Override semantics (persisted in the `cadence_override` column, added by migration 0001):

- `cadence_override = false` → cadence auto-derives from `currentPriority`. When priority changes
  (via edit or career-goal recalculation) the cadence follows automatically.
- `cadence_override = true` → the user's chosen cadence is frozen; priority changes and
  recalculation never overwrite it.
- The **"Use automatic cadence"** action (Edit Contact) sets `cadence_override = false` and
  immediately re-applies `deriveSuggestedCadence(currentPriority)`.

Conceptually: `effectiveCadence = manualCadenceOverride ?? deriveSuggestedCadence(effectivePriority)`.

The initial-follow-up window (1–3 days) is a separate concept living in the frontend
`suggestInitialFollowUp()` and is not part of the recurring-cadence source of truth.

## 4. Marking a contact as contacted, and the auto-downgrade rule

**Where:** `routes/contacts.ts`, `POST /api/contacts/:id/mark-contacted`.

```sql
next_follow_up_date = CASE
  WHEN (CURRENT_DATE - first_contact_date) >= ($3 * 30)
    THEN CURRENT_DATE + INTERVAL '180 days'
  ELSE CURRENT_DATE + (follow_up_cadence_days || ' days')::INTERVAL
END
```

Where `$3` is the user's `auto_downgrade_after_months` setting (default 6). In plain terms: if a
relationship has existed for at least `auto_downgrade_after_months × 30` days, the *next*
follow-up is pushed out a full 180 days regardless of the contact's normal cadence — the
relationship is being deliberately downgraded to a low-maintenance "keep warm occasionally"
cadence rather than continuing to demand frequent attention indefinitely. Otherwise, the next
follow-up is simply `today + follow_up_cadence_days`.

**Why:** this reflects a real relationship-maintenance philosophy — a contact you've known and
maintained for a long time doesn't need the same aggressive cadence as a brand-new connection you're
still building. It's a time-in-relationship signal, independent of priority.

## 5. When priority/cadence get recalculated in bulk

**Where:** `lib/recalculate.ts`, `recalculateContactsForUser(userId)` — the single mechanism used
by both `PUT /api/settings` and the maintenance endpoint `POST /api/contacts/recalculate`.

Any `PUT /api/settings` call that touches `careerGoals`, `goalTags`, or `careerStatement`
recalculates that user's contacts **synchronously** (no more `setImmediate` fire-and-forget) and
returns a completion report on the response as `recalculation: { ok, examined, updated,
priorityOverridesSkipped, cadenceOverridesSkipped, failures }`. For each contact:

- if `priority_override` is true, its priority is left untouched (counted as a priority-override
  skip); otherwise `currentPriority` is recomputed via `computeSuggestedPriority`.
- if `cadence_override` is true, its cadence is left untouched (counted as a cadence-override
  skip); otherwise `follow_up_cadence_days` is re-derived from the effective priority.
- only rows that actually change are written, in a single batched `UPDATE ... FROM UNNEST(...)`.
  The function is **idempotent** and performs no destructive operations, so it is safe to run
  repeatedly (e.g. after applying migration 0001).

Because the recompute is synchronous, the frontend (`useSettings.ts`) simply invalidates its
contacts cache once the mutation resolves — **the old hardcoded 2-second `setTimeout` has been
removed**. The mutation's pending state IS the "recalculating" indicator, and any recalculation
failure surfaces via `recalculation.ok === false`.

## 5a. Company-news states

**Where:** backend `routes/news.ts` (`GET /api/company-news`), frontend `hooks/useCompanyNews.ts`,
rendered in `ContactDetail.tsx`.

The backend returns structured diagnostics — `headlines`, `fetchedAt`, `fromCache`, `stale`,
`error` (`config_missing` | `timeout` | `fetch_failed`), and `detail` — and the frontend
**preserves and displays them** rather than collapsing everything into "No recent company news
found." The distinct UI states are: **loading**, **ok** (headlines found), **empty** (fetch
succeeded, genuinely no relevant articles), **error** (request failed), **config-missing**
(`GNEWS_API_KEY` not set on the backend), **timeout**, and **stale** (cached results shown after a
refresh failure). `GNEWS_API_KEY` is declared in `render.yaml` for the web service (value set in
the Render dashboard, `sync: false`).

## 6. Contact limit (beta constraint)

**Where:** `routes/contacts.ts`, `FREE_TIER_LIMIT = 25`.

A hard cap of 25 contacts per user, enforced with a `COUNT(*)` check before insert. The user-facing
error message ("You've reached the 25-contact limit for the beta. More spots are coming soon!")
confirms this is a deliberate beta-stage constraint, not a bug.

## 7. Install flow (PWA)

**Where:** `artifacts/project-novara/src/components/InstallPrompt.tsx`,
`artifacts/project-novara/src/pages/InstallGuide.tsx`, `vite.config.ts`'s PWA manifest
(`start_url: "/install"`), and `App.tsx`'s `HomeRedirect`.

As implemented in this working copy: `InstallPrompt` is a dismissible bottom banner shown to any
signed-in-or-not visitor who isn't already in standalone (installed) display mode and hasn't
previously dismissed it (`localStorage["novara_install_dismissed"]`). On Android, tapping
"Install" uses the native `beforeinstallprompt` deferred-prompt flow if available; otherwise (and
always on iOS, since Safari has no programmatic install prompt) it routes to `/install`
(`InstallGuide`), which shows manual "Add to Home Screen" steps split by iPhone/Android tab.

**Important caveat, stated plainly:** the PWA manifest's `start_url` is `/install`, meaning an
installed/standalone launch of the app opens directly to the install guide, not the dashboard.
`HomeRedirect` in `App.tsx` (this working copy) has no display-mode-aware branch to catch and
redirect a standalone launch past the install guide — it only distinguishes signed-in vs.
signed-out. This means, **as currently written**, a returning installed-PWA user would see the
install guide again on every app open rather than landing on their dashboard. See `15-Known-Issues.md`
— this exact gap (install page appearing to already-installed/returning users) is precisely the
kind of routing bug this documentation effort's own prior conversation context describes having
been fixed in a later, not-currently-present version of this code.

## 8. Feedback lifecycle

**Where:** `routes/feedback.ts`, `lib/email.ts`, `Feedback.tsx`. See `diagrams/feedback-flow.mmd`.

1. User submits the in-app feedback form (Settings → Send Feedback).
2. Server validates, inserts a row (`status: "new"`), and responds `201` **immediately**.
3. Only after responding does the server attempt to email a notification to `FEEDBACK_TO_EMAIL`
   (default `novaraconnect@gmail.com`) via Resend — explicitly "best-effort," per the code comment
   in `lib/email.ts`: "A rejected promise here means 'email failed, submission is still safely
   stored' — callers must never roll back or re-throw in a way that loses the database record."
4. If `RESEND_API_KEY` is unset, the email step is skipped entirely with a warning log — the
   submission is still saved.
5. Diagnostic context (route, user-agent, app version) is captured **only for bug reports**
   (`type === "bug"`), and is explicitly documented as excluding secrets, tokens, headers, and
   cookies.
6. Nothing in the reviewed codebase transitions `feedback.status` away from `"new"` — despite the
   schema comment describing `new`/`reviewing`/`resolved`/`closed` as the full lifecycle, only the
   first state is ever written by application code. Status changes, if they happen, appear to
   happen by hand (e.g. directly in the database).

## 9. Notification timing and content rules

**Where:** `lib/scheduler.ts`, `runDailyNotifications()`.

Runs once daily at 09:00 UTC (hardcoded — not derived from each user's individual
`reminder_time` setting, see `03-Database.md`). Per user with `push_enabled = true`:

- **Due today:** contacts whose `next_follow_up_date` is today. If exactly one, a personalized
  notification; if more than one, a single grouped notification ("N follow-ups due today").
- **Overdue:** contacts whose `next_follow_up_date` is strictly before today. Same
  single-vs-grouped logic.
- **Status change ("warming down"/"went cold"):** for every contact, computes days overdue. If
  exactly 1 day overdue, a "warming down" notification; if days-overdue equals that contact's own
  `follow_up_cadence_days`, a "went cold" notification. This means the "went cold" signal is
  cadence-relative per contact, not a fixed number of days for everyone.
- At most 5 notifications are sent per user per run (`notifications.slice(0, 5)`), regardless of
  how many conditions matched — a deliberate cap to avoid notification-spamming a user with a large
  overdue list.
- Each user preference (`notify_due_today`, `notify_overdue`, `notify_status_change`) independently
  gates its category.

## 10. Search, sorting, and filtering

Contacts are always returned from `GET /api/contacts` sorted by `next_follow_up_date ASC` — the
most urgent contact first, at the database level (not client-side). No server-side search/filter
query parameters exist on this endpoint in the code reviewed; any search/filter UI in the frontend
operates on the already-fetched, already-sorted full contact list client-side (see `06-Frontend.md`
for the relevant components, e.g. `Contacts.tsx`).

## 11. Authentication rules

Covered in full in `08-Authentication.md`. The one rule worth repeating here because it's load-
bearing for every other rule in this document: **`userId` is always derived from the verified
Clerk session server-side, never accepted from the request body.** Every business rule above that
says "per user" depends on this holding true everywhere, and it does in every route reviewed.
