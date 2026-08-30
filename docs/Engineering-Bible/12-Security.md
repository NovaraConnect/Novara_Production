# 12 — Security

This document states plainly what was directly verified by reading source in this working copy,
separately from what prior audit documents in this repository claim. Where the two disagree, both
are stated, with the direct code reading taking precedence as fact about *this checkout*.

## Authentication

Handled entirely by Clerk — see `08-Authentication.md` for the full flow. `requireAuth`
(`middlewares/auth.ts`) is applied per-route, not globally, and correctly derives `userId` only
from the verified session (`getAuth(req)`), never from client input. Verified true across every
route reviewed (`contacts.ts`, `settings.ts`, `notifications.ts`, `feedback.ts`).

## Authorization / multi-tenancy

Every data-access query reviewed in `contacts.ts`, `settings.ts`, and `notifications.ts` filters by
`user_id = $N` bound to the authenticated session's `userId`. No cross-user data access path was
found. There is no admin role or elevated-privilege access path anywhere in the reviewed code —
every user has exactly the same permissions over exactly their own data.

## Routes with no authentication (by design or by gap)

| Route | Auth? | Assessment |
|---|---|---|
| `GET /api/healthz` | None | Correct — a health probe should be unauthenticated. |
| `GET /api/notifications/vapid-public-key` | None | Correct by the code's own reasoning — needed before any user-specific permission prompt, and the VAPID public key isn't sensitive. |
| `GET /api/company-news` | None | Flagged as a gap in the repo's own prior audit (`PRODUCTION_CHECKLIST.md`: "Add auth to `GET /api/company-news`... Currently unauthenticated; anyone can exhaust the shared GNews.io daily quota"). Directly confirmed still true in this working copy — no `requireAuth` in `news.ts`. |

## CORS

**Directly observed in `app.ts`:** `app.use(cors({ credentials: true, origin: true }))`. This
allows **any origin**, with credentials (cookies/auth headers) permitted. This is the exact
configuration the repo's own `LAUNCH_READINESS_REPORT.md` describes as "a real cross-origin
credential-theft risk" and claims was replaced with "an explicit allowlist." That allowlist is not
present in this working copy's `app.ts` — there is no reference to `FRONTEND_URL` anywhere in
`app.ts`, despite `.env.example` documenting `FRONTEND_URL` as "Used both for the CORS allowlist
and as Clerk's `authorizedParties`." Since API auth uses Bearer tokens (not cookies) for actual
data access, the practical exploitability of this specific CORS configuration depends on whether
any cookie-based session state exists in practice — worth a deliberate, direct check before
dismissing it, not an assumption either way.

## Security headers

No `helmet()` call (or manual equivalent) exists anywhere in `app.ts`, despite `helmet` being a
listed dependency in `artifacts/api-server/package.json`. No security headers (CSP,
`X-Content-Type-Options`, `X-Frame-Options`, HSTS, etc.) are set by the application itself in this
working copy. This also contradicts prior-audit claims of headers having been added.

## Rate limiting

`POST /api/feedback` and `POST /api/parse-card-text` have rate limiters (10/hour and 20/minute
respectively, per authenticated user). No app-wide rate limiter exists in `app.ts`. This means
`GET /api/company-news` — the unauthenticated route above — has **no rate limiting at all**,
compounding its lack of auth: it can be hit as fast as the network allows, by anyone.

## Input validation

Inconsistent across routes — see `07-Backend.md`. `feedback.ts` has the most thorough validation
(type/length checks on every field, an explicit allowlist of `type` values). `contacts.ts` and
`settings.ts` validate almost nothing beyond a few required-field truthy checks; most fields are
accepted and written with `||`/`??` fallbacks rather than type or bounds validation. This means, for
example, nothing currently prevents a malformed `followUpCadenceDays` value outside the frontend's
own declared literal union from being written directly via the API.

## Secrets handling

- No secret values are reproduced anywhere in this documentation set (see `17-Configuration-Reference.md`
  for names only).
- `logger.ts` explicitly redacts `req.headers.authorization`, `req.headers.cookie`, and
  `res.headers['set-cookie']` from structured logs — a real, verified protection.
- **`settings.ts`'s `PUT /api/settings` handler logs the full incoming request body** (career
  statement, career goals, goal tags) via plain `console.log` at multiple steps, and per-contact
  before/after priority values. None of this is a credential, but career statements and goals are
  personal data a user typed expecting it to be saved, not necessarily logged verbatim to the
  server's console/log aggregator on every request. Worth removing before treating this route as
  production-clean — see `15-Known-Issues.md`.
- A full git-history secret scan (`gitleaks`/`trufflehog` against the complete commit history) was
  **not performed** as part of this documentation effort — this environment does not have
  authenticated git clone access to the repository's full history, only the current working copy's
  file contents. This is a real gap, not a clean bill of health, and the repo's own prior audit
  docs note the same limitation. It should be run by someone with full repo access before
  considering secrets handling audited.

## SSRF considerations

No route currently fetches a user-supplied URL. `POST /api/linkedin/import` — previously the one
endpoint that did, and the one flagged here as most worth a focused security review — was removed
entirely in PR #9, so the backend no longer fetches linkedin.com at all.

The outbound requests the API still makes are to fixed, first-party-configured hosts (GNews for
company news; the configured AI provider for the optional business-card text parser), not to
user-supplied URLs.

## OWASP-style summary (informal, not a formal pen-test)

| Concern | Status in this working copy |
|---|---|
| Broken access control | Not found at the data layer (all queries `user_id`-scoped); found at the route layer (2 unauthenticated routes, see above) |
| Cryptographic failures | No custom crypto; TLS/secrets handled by Render/Clerk/Neon platform defaults |
| Injection | All SQL is parameterized (`$1`, `$2`, ...); no string-concatenated queries found |
| Insecure design | Feedback rate limiting, fail-soft integrations, and `priorityOverride` are all evidence of deliberate defensive design elsewhere in the app |
| Security misconfiguration | Open CORS, no security headers, no app-wide rate limit — see above |
| Vulnerable/outdated components | Not assessed in this pass; run `pnpm audit` or equivalent separately |
| Auth failures | Core auth (Clerk + `requireAuth`) is sound; the remaining unauthenticated data-adjacent route is the real gap |
| Data integrity failures | No package-lock/dependency-integrity issue found; `pnpm-workspace.yaml`'s `minimumReleaseAge: 1440` setting is a deliberate, well-documented supply-chain defense (see `17-Configuration-Reference.md`) |
| Logging/monitoring failures | No external uptime monitoring or alerting found anywhere in the repo (also independently noted in `INCIDENT_RESPONSE.md`) |
| SSRF | No user-supplied-URL fetch remains — see above |

## Bottom line

The core authentication and multi-tenant data-isolation model is sound and consistently applied.
The gaps are concentrated in a small, specific set of places: one unauthenticated/unrate-limited
route, an open CORS policy, absent security headers despite a listed dependency for them, and
verbose debug logging of user-typed personal data in one route. None of this is exotic or hard to
fix; all of it is worth fixing before treating this API as hardened for a public launch.
