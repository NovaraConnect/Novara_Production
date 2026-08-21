# The Novara Engineering Bible

## What this is

This is the complete institutional knowledge of Novara, written so that a new engineering team
— with no access to the founder, no Slack history, no tribal knowledge — could read it and
rebuild, operate, or extend the product with confidence. It documents both **what** the system
does and **why** it was built that way, to the extent "why" is recoverable from the repository
itself.

Every factual claim in these documents is grounded in something actually present in this
repository: source code, configuration files, migrations, or the pre-existing audit documents at
the repo root (`ARCHITECTURE.md`, `ENVIRONMENT_VARIABLES.md`, `INCIDENT_RESPONSE.md`,
`LAUNCH_READINESS_REPORT.md`, `PRODUCTION_CHECKLIST.md`, `TEST_REPORT.md`). Nothing here is
invented. Where something could not be determined from the repository, that is stated explicitly
rather than guessed at.

## Read this first: a critical caveat about this repository's freshness

While writing this documentation (July 2026), direct, line-by-line reading of the source in this
working copy turned up multiple, mutually-reinforcing signs that **this repository is not fully
in sync with what is actually deployed to production**, and possibly not in sync with the
authoritative `main` branch on GitHub either. Concretely, and independently of each other:

- The root-level audit docs (`ARCHITECTURE.md`, `LAUNCH_READINESS_REPORT.md`,
  `INCIDENT_RESPONSE.md`) describe a CORS allowlist, security headers (Helmet), and an app-wide
  rate limiter as having been added to `artifacts/api-server/src/app.ts` and verified live. The
  `app.ts` actually present in this working copy has none of these — CORS is still
  `cors({ credentials: true, origin: true })` (any origin, with credentials), `helmet` is a listed
  dependency in `package.json` but is never imported anywhere, and there is no app-wide rate
  limiter (only a per-route one on `/api/feedback`).
- Those same docs describe `.github/workflows/ci.yml` as existing and green. No `.github`
  directory exists anywhere in this working copy.
- `artifacts/project-novara/src/App.tsx`'s `HomeRedirect` component in this working copy is a
  simple signed-in/signed-out branch with no install-flow-aware routing logic (no
  standalone-display-mode check, no "have they seen the install prompt" check), even though the
  PWA manifest's `start_url` is `/install` — meaning an installed PWA user currently lands on the
  install guide every time they open the app, not the dashboard.
- The Settings page in this working copy has a single "Send Feedback" entry under "Support," not
  the two separate bug-report / feature-request entries with distinct icons observed when directly
  testing the **live production app** during this same documentation effort.
- `artifacts/project-novara/src/hooks/useContacts.ts` passes `fetchContacts`, `createContact`, and
  friends directly as TanStack Query `queryFn`/`mutationFn` values, but the functions they call in
  `lib/api.ts` require a `getToken` callback as their first argument, which TanStack Query does not
  supply. As written, this would throw at runtime, which is inconsistent with contacts
  functionality having been exercised successfully in production in the past.

None of this is asserted as fact about production — it is exactly what direct code reading in
*this* working copy shows, contrasted with directly-observed production behavior and the
repository's own prior documentation. The most likely explanation is that this local working copy
is a snapshot taken partway through the project's development and was never refreshed after later
work was pushed straight to GitHub's `main` branch through means other than this checkout (see
`15-Known-Issues.md` for the full list). **Before treating this documentation, or this checkout,
as the authoritative source for a rebuild, reconcile it against the current GitHub `main` branch
and the actual deployed Render services.** This warning is repeated in `15-Known-Issues.md` because
it is the single most important fact a future engineer needs before trusting anything else here.

## How this documentation is organized

Read in order if you're new to Novara; jump to a specific number if you already know the system:

| # | Document | What's in it |
|---|---|---|
| 01 | `01-Product-Overview.md` | What Novara is, who it's for, what it deliberately isn't |
| 02 | `02-System-Architecture.md` | The whole system end to end, with diagrams |
| 03 | `03-Database.md` | Every table, column, and relationship |
| 04 | `04-API.md` | Every HTTP endpoint: method, auth, request, response, rules |
| 05 | `05-Business-Rules.md` | The logic that makes Novara *Novara*, and why it exists |
| 06 | `06-Frontend.md` | Every page, component pattern, and piece of client state |
| 07 | `07-Backend.md` | Server architecture, middleware, logging, background jobs |
| 08 | `08-Authentication.md` | Clerk integration end to end |
| 09 | `09-Deployment.md` | Render, Neon, Clerk, Resend, GitHub — how it's actually hosted |
| 10 | `10-Development.md` | Clone, install, run, test, build, deploy, debug |
| 11 | `11-Testing.md` | What's tested, what isn't, and in what order to fix that |
| 12 | `12-Security.md` | Auth, validation, secrets, headers, rate limiting, gaps |
| 13 | `13-Performance.md` | Caching, indexes, PWA performance, scaling ideas |
| 14 | `14-Architecture-Decisions.md` | Why this stack, alternatives considered, tradeoffs |
| 15 | `15-Known-Issues.md` | Every known bug, gap, and piece of technical debt |
| 16 | `16-Rebuild-Guide.md` | If you were starting over today, what would you do differently |
| 17 | `17-Configuration-Reference.md` | Every env var, config file, script, and external dependency |

Plus:

- `diagrams/` — Mermaid diagrams referenced throughout (architecture, sequence flows, ER diagram,
  deployment topology). View them in any Mermaid-compatible renderer (GitHub renders `.mmd`
  fenced blocks natively; VS Code with the Mermaid extension renders `.mmd` files directly).
- `../Founder-Vision.md` (one level up, at `docs/Founder-Vision.md`) — the non-technical soul of
  the product: why it exists, who it's for, and what should never change about it regardless of
  how the code evolves.

## Conventions used throughout

- **File paths** are given relative to the repository root (e.g. `artifacts/api-server/src/app.ts`).
- **Direct quotes from code** are used sparingly and only to establish a precise technical claim
  (a function signature, an env var name, an error message) — not to reproduce large blocks of
  source. Read the referenced file directly for full context.
- **"Verified" vs. "documented"**: where a claim was directly confirmed by reading source in this
  repository, it's stated as fact. Where a claim comes from the pre-existing root-level audit docs
  and could not be independently re-verified in this pass, that's noted.
- **No invented content.** Anywhere this documentation would otherwise need to guess (a future
  roadmap item, an unstated design rationale), it says so explicitly instead of filling the gap
  with something plausible-sounding.

## Who should read what

- **New backend engineer:** 02 → 03 → 04 → 07 → 08 → 12
- **New frontend engineer:** 02 → 06 → 04 (as a client) → 08
- **New engineer doing on-call / ops:** 09 → 15 → `INCIDENT_RESPONSE.md` (repo root)
- **New engineer inheriting the whole thing with no handoff:** all of it, in order, starting here.
