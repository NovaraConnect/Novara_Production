# Novara — Production

Clean-history production repository for Novara. This repo intentionally starts
from a single initial commit — it does **not** carry the pilot repo's Git history
(which contained a committed user-data dump).

- **Pilot** (unchanged): `NovaraConnect/Novara-Mobile2` — the live MBA pilot. Do not confuse the two.
- **This repo**: the clean codebase to stand up a separate production environment
  (new Render services, new Neon `production` branch, Clerk production instance,
  custom domain) and the App Store track.

## Start here
The full production playbook lives in **[`docs/production/`](docs/production/README.md)**:
architecture map, deployment plan, Render env vars, Neon/Clerk setup, schema SQL,
data-migration draft, TestFlight/App Store checklist, rollback plan, and the
ready/not-ready assessment.

Environment templates: `.env.example`, `.env.pilot.example`, `.env.production.example`.

## Monorepo layout
- `artifacts/api-server` — Express API (build: esbuild)
- `artifacts/project-novara` — React/Vite web frontend
- `artifacts/novara-mobile` — Expo mobile app (App Store target)
- `lib/*` — shared db, api-spec, api-zod, api-client-react, novara-priority

## Local verify
```bash
pnpm install
pnpm run typecheck
pnpm --filter @workspace/api-server run build
```
