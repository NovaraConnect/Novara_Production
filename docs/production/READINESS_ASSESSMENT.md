# Production Readiness Assessment

Date: 2026-08-20. Scope: the `production-clean` branch (this clean copy) and the
plan to stand up a separate production environment. Honest verdict, not a rubber stamp.

## Verdict

**The clean production CODEBASE is ready to deploy to a new environment. The production ENVIRONMENT is not yet stood up, and App Store submission is a separate track that is not started.**

Put plainly: the code is in good shape and safe to build/deploy to new infra; the
infrastructure, external accounts, and Apple pipeline still need to be created —
none of which can happen without your approval and account access.

## What IS ready ✅
- **Clean codebase**: Replit config, experimental sandbox, scratch assets, pitch images, and a committed **user-data dump** all removed. Only production-required code remains.
- **Backend hardened**: `/api/company-news` auth-gated; `/api/healthz` reports DB var accurately; `engines` pinned; existing tests updated to match. (commit `f202d15`)
- **Deterministic build**: `@types/react` pinned; lockfile refreshed. **Verified locally**: typecheck passes for all packages; backend production build (esbuild) passes. Frontend vite build runs on Linux (Render/CI) by design.
- **Full documentation set**: architecture map, deployment plan, exact Render env vars, Neon/Clerk setup, reproducible schema SQL, data-migration draft, TestFlight/App Store checklist, rollback plan.
- **Pilot protected**: all work is on a new branch + folder; nothing touched pilot Render/Neon/Clerk; auto-deploy is OFF so merges can't reach pilot users.

## What is NOT ready ❌ / not started
- **Production infra not created**: new Render backend + frontend, new Neon `production` branch, Clerk production instance, custom domains — all still to do (⚠️ need approval + account access).
- **No production secrets set** (by design).
- **App Store track not started**: no Apple Developer enrollment, no `eas.json`, no `ios.bundleIdentifier`, no privacy policy URL, no App Store Connect listing, no demo account.
- **Data migration not executed** (draft only; needs your approved SQL + user list).
- **Not load-tested**; **no external uptime monitoring** on production yet.
- **Frontend full E2E** not run in this pass (Playwright exists; run in CI).
- **Git-history secret scan** still recommended (run `gitleaks`/`trufflehog` with repo clone access).

## Recommended next actions (in order)
1. You: approve repo/DB/Clerk/Render creation, enroll in Apple Developer Program.
2. Me (once approved): pre-write `eas.json` + set `ios.bundleIdentifier`, scaffold `render.yaml` for the new services, wire `EXPO_PUBLIC_API_BASE_URL`.
3. Stand up Neon prod branch → apply schema → Clerk prod → deploy backend → frontend → domains.
4. Smoke test (see `DEPLOYMENT_PRODUCTION.md`), add uptime monitoring.
5. Migrate selected users (approved SQL).
6. EAS build → TestFlight internal → external (MBA pilot) → App Store review.

## Bottom line
Green light to **build and deploy the clean code to new infrastructure**. Not yet a
"live production app with App Store presence" — that requires the infra + Apple steps
above, each gated on your approval.
