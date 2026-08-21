# Architecture Map — Pilot vs Production

## Overview

Novara is a pnpm monorepo with three deployable artifacts sharing `lib/*`:

| Artifact | Tech | Role |
|---|---|---|
| `artifacts/api-server` | Express + TypeScript (esbuild → `dist/index.mjs`) | REST API, auth, cron, push, email |
| `artifacts/project-novara` | React 19 + Vite (static bundle) | Web/PWA frontend |
| `artifacts/novara-mobile` | Expo + expo-router | Mobile app (App Store target) |

Shared libs: `lib/db` (Drizzle + pg), `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, `lib/novara-priority` (priority engine, the product's core logic).

External services: **Neon** Postgres, **Clerk** auth, **GNews** (news), **Resend** (email), **Web Push/VAPID**, **PostHog** (analytics).

## The two environments

| Concern | PILOT (existing — do not touch) | PRODUCTION (new) |
|---|---|---|
| GitHub | `NovaraConnect/Novara-Mobile2` @ `main` | same repo, `production` branch |
| Backend | Render `Novara-Mobile2` (`srv-d95fn6hkh4rs738f0jng`) → `novara-mobile2.onrender.com`, Starter, **auto-deploy OFF** | new Render web svc `novara-prod-api` → `api.novaraconnect.group` |
| Frontend | Render `Novara-Mobile2-frontend` (`srv-d95g49vlk1mc73cjopfg`), static | new Render static `novara-prod-web` → `app.novaraconnect.group` |
| Database | Neon (pilot branch) via `DATABASE_URL` | **new Neon `production` branch** |
| Auth | Clerk **development** instance (`pk_test_`/`sk_test_`) | Clerk **production** instance (`pk_live_`/`sk_live_`) + custom domain |
| Mobile dist | Expo Go link (not App Store) | EAS Build → TestFlight → App Store |
| Data | Live MBA pilot users | Selected users migrated + new signups |

## Request flow (identical in both environments)

```
Mobile (Expo) ─┐
Web (Vite PWA)─┼─→  api-server  ─→  Neon Postgres
               │        │
      Clerk ───┘        ├─→ GNews (news)      [auth-gated]
   (session token       ├─→ Resend (feedback email)
    verified by         └─→ Web Push (daily cron, node-cron 09:00 UTC)
    backend middleware)
```

Auth: frontend obtains a Clerk session token and sends `Authorization: Bearer <token>`; backend `requireAuth` verifies it via Clerk. Frontend and backend **must** use the same Clerk instance. Backend also proxies Clerk under `/api/__clerk` (see `VITE_CLERK_PROXY_URL`).

## What changed in this clean copy vs pilot `main`
- Backend hardening: `/api/company-news` auth-gated; `/api/healthz` DB-var check corrected; `engines` pinned (commit `f202d15`).
- Removed: Replit config, `mockup-sandbox`, pitch images, scratch assets, and a committed **user-data dump** (commit `2317307`).
- Pinned `@types/react` to a single version for deterministic typecheck.

## Data model (4 tables)
`contacts` (per-user CRM rows, indexed by `user_id`), `user_settings` (per-user prefs, PK `user_id`), `push_subscriptions` (device push, unique `user_id+endpoint`), `feedback` (Drizzle-managed). Full DDL: `docs/production/schema/production_schema.sql`. Only `feedback` is under Drizzle migrations today; the rest are captured in that schema file for reproducibility.
