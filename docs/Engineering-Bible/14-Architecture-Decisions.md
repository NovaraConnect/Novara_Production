# 14 — Architecture Decisions

This document records the significant technical choices visible in the codebase, along with the
rationale where it's actually recoverable (from code comments or unambiguous structural evidence)
versus where it's inferred. Where no rationale is recoverable, that's stated rather than invented.

## Why a pnpm monorepo

**Evidence:** `pnpm-workspace.yaml` defines `artifacts/*` (deployables) and `lib/*` (shared
internal packages) as workspace members, with a `catalog:` block pinning shared dependency versions
(React, Vite, TanStack Query, Drizzle, etc.) across every package that needs them.
**Inferred rationale:** three deployable clients (web, mobile, an internal preview tool) plausibly
share a meaningful amount of logic (API contracts, types), and a monorepo with a shared dependency
catalog keeps versions of cross-cutting libraries (especially React — see below) from drifting
between packages. Not stated explicitly anywhere in the repo as a decision record.

## Why Clerk for authentication

**Evidence:** Clerk is used for both the web and mobile clients (`@clerk/react` on web,
implied Clerk Expo usage referenced in `migration/api.ts`'s header comment: "Pass a `getToken`
function — use `useAuth` from `@clerk/clerk-expo`").
**Inferred rationale:** Clerk provides a complete hosted auth UI (`<SignIn>`/`<SignUp>` components)
that needed essentially no custom auth UI to be built, and its React SDK covers both web and React
Native, matching this project's multi-client footprint. Not stated explicitly as a decision record.
**Tradeoff paid, directly observed:** Clerk instance misconfiguration (frontend and backend
pointed at two different Clerk instances) previously caused a full silent authentication outage —
documented in the repo's own `INCIDENT_RESPONSE.md`/`ARCHITECTURE.md`. This is the clearest
documented cost of the Clerk-proxy-through-backend architecture: it adds a real class of
misconfiguration risk (instance/domain alignment) in exchange for avoiding CNAME DNS setup.

## Why proxy Clerk's Frontend API through the backend

**Evidence:** `clerkProxyMiddleware.ts`'s own header comment: "enabling Clerk authentication on
custom domains and `.replit.app` deployments without requiring CNAME DNS configuration." This is a
stated rationale, not inferred.
**Tradeoff:** adds middleware-ordering complexity (must run before `express.json()`) and an extra
hop for every Clerk Frontend API call, in exchange for not needing DNS-level configuration per
deployment domain — a reasonable tradeoff specifically because this project has been deployed
across multiple platforms/domains (Replit, Render) during its life.

## Why Neon (serverless Postgres) instead of a traditional managed Postgres

**Not stated anywhere in the repo.** Neon's serverless/scale-to-zero model is a natural fit for a
beta-stage product with unpredictable, likely low, traffic, but this document does not claim that
was the actual reasoning — only that it's a plausible fit given the product's current stage. No
alternative (RDS, Supabase, self-hosted Postgres) is discussed anywhere in the repository.

## Why raw SQL (`pg.Pool`) at runtime instead of the Drizzle ORM already in the workspace

**Evidence:** `@workspace/db` (Drizzle) exists, fully wired for the `feedback` table, with
generated migrations and Zod schemas — but `artifacts/api-server/src/routes/*.ts` (including
`feedback.ts` itself) import `pool` from the local `../db` (a hand-rolled `pg.Pool` + manual
camelCase mapping), not from `@workspace/db`.
**Not stated anywhere why.** This reads as an incomplete migration *toward* Drizzle — the
`feedback` table got a proper Drizzle schema and migration when it was added, but the
runtime query layer for it (and everything else) was never switched over to actually use the
Drizzle client. This is flagged as a real, current architectural inconsistency in
`15-Known-Issues.md`, not defended as an intentional design choice, because no comment or
commit rationale in the repository claims it was intentional.

## Why a PWA instead of (or in addition to) native mobile apps

**Evidence:** `artifacts/project-novara` is built with `vite-plugin-pwa`, an installable manifest,
and offline-capable service worker — this is the primary, most complete client. A native-adjacent
mobile client exists (`artifacts/novara-mobile`, Expo/React Native) but is deployed only as a
static Expo Go bundle, not published to app stores (`09-Deployment.md`).
**Inferred rationale:** a PWA ships to every platform (iOS, Android, desktop) from a single
codebase with zero app-store review latency, which fits a fast-moving beta product where UX like
the install-flow logic in this very audit is still being iterated on. The cost — no app-store
discoverability, iOS's more limited PWA capabilities compared to Android, and (per
`ARCHITECTURE.md`) Expo Go's own constraints on the mobile side (no custom native modules) — is a
real, paid tradeoff, not a free lunch.

## Why plain-text `type`/`status` columns instead of Postgres enums

**Evidence:** `lib/db/src/schema/feedback.ts`'s own comment, quoted in full because it's an
unusually explicit piece of stated rationale: "kept as free text (not a Postgres enum) to match the
rest of this codebase's convention of plain text columns with application-level validation ...
rather than DB-level enums, so adding a new type never requires a migration." This is the single
clearest, most explicitly-stated architectural decision found anywhere in the codebase.

## Why career-goal matching is a loose bidirectional substring match, not exact matching or embeddings

**Evidence:** `lib/priority.ts`'s `calculatePriority()` uses `w.includes(g) || g.includes(w)` —
deliberately loose. **Not explained in a comment**, but the design is internally consistent: this
is a beta-stage heuristic that requires no external ML/embedding service, no additional
infrastructure, and no latency cost, at the expense of precision (it can both under- and
over-match on coincidental substrings). This is a reasonable "simplest thing that could plausibly
work" choice for an early-stage feature, not defended as a permanent architectural commitment
anywhere in the repo.

## Why fail-soft on every optional integration

**Evidence, repeated across the codebase, quoted directly where possible:** VAPID keys missing →
"push notifications disabled" (warning, no crash). `RESEND_API_KEY` missing → "skipping feedback
email notification" (warning, no crash, submission still saved — explicitly documented in
`lib/email.ts`'s own comment as intentional: "A rejected promise here means 'email failed,
submission is still safely stored' — callers must never roll back or re-throw in a way that loses
the database record"). `GNEWS_API_KEY` missing or GNews failing → the route returns a degraded
response, not a 500. This is a consistent, deliberate pattern across three independent integrations
written by (presumably) the same team, strong enough evidence to call it a real architectural
principle even though it's never written down as one in a single place — see `01-Product-Overview.md`.

## Alternatives not discussed in the repository

To be honest about the limits of what this document can claim: no ADR (architecture decision
record) files, no design docs, and no comparison of alternatives for any of the above were found
anywhere in the repository. Every "why" above is either a direct quote from a code comment or an
inference clearly labeled as such. A future engineer disagreeing with any of these choices should
not assume there was a rejected alternative on record — there may simply not have been one
considered.
