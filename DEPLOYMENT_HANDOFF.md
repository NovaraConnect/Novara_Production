# Novara — Deployment Handoff

> All values below are sourced directly from the files listed. All Replit-specific
> assumptions have been removed from the codebase as of this document.

---

## Folder map

| Role | Directory | Package name |
|---|---|---|
| Browser web app | `artifacts/project-novara` | `@workspace/project-novara` |
| Backend API | `artifacts/api-server` | `@workspace/api-server` |
| Expo mobile app | `artifacts/novara-mobile` | `@workspace/novara-mobile` |
| Shared DB client | `lib/db` | `@workspace/db` |

---

## Backend — Render Web Service

### Build command
```
pnpm install && pnpm --filter @workspace/api-server run build
```
Runs `node ./build.mjs` (esbuild). Output: `artifacts/api-server/dist/index.mjs`

### Start command
```
pnpm --filter @workspace/api-server run start
```
Runs `node --enable-source-maps ./dist/index.mjs`

### Render environment variables

Set these in **Render → Environment** for the API Web Service.

| Variable | Required | Value |
|---|---|---|
| `NODE_ENV` | **Yes** | `production` |
| `PORT` | **Yes** | Set automatically by Render — do not hardcode |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string. `artifacts/api-server/src/db.ts` reads `process.env.DATABASE_URL` (falls back to `NEON_DATABASE_URL` for Replit). Use your Neon (or other PG) connection string here |
| `CLERK_PUBLISHABLE_KEY` | **Yes** | `pk_live_...` |
| `CLERK_SECRET_KEY` | **Yes** | `sk_live_...` |
| `GNEWS_API_KEY` | **Yes** | GNews.io API key (100 req/day free tier) |
| `VAPID_PUBLIC_KEY` | No | Web Push VAPID public key. Generate: `npx web-push generate-vapid-keys`. Push silently disabled if absent |
| `VAPID_PRIVATE_KEY` | No | Web Push VAPID private key |
| `VAPID_SUBJECT` | No | `mailto:hello@novara.app` (default if unset) |
| `LOG_LEVEL` | No | `info` (default) |

Template: `artifacts/api-server/.env.example`

---

## Frontend — Vercel (or Render Static Site)

### Build command
```
pnpm install && pnpm --filter @workspace/project-novara run build
```
Runs `vite build --config vite.config.ts`

### Publish / output directory
```
artifacts/project-novara/dist/public
```
Sourced from `artifacts/project-novara/vite.config.ts` → `build.outDir`.

### Vercel / Render environment variables

Set these as **build-time** environment variables.

| Variable | Required | Value |
|---|---|---|
| `PORT` | No | `5173` (or any number). `vite.config.ts` defaults to `5173` if unset — no longer throws |
| `BASE_PATH` | No | `/` (default). Set to `/novara` only if hosting under a subpath |
| `VITE_CLERK_PUBLISHABLE_KEY` | **Yes** | `pk_live_...` — baked into the JS bundle at build time |
| `VITE_CLERK_PROXY_URL` | **Yes (production)** | `https://<your-render-api-domain>/api/__clerk` |
| `VITE_API_BASE_URL` | **Yes (cross-origin)** | `https://<your-render-api-domain>` — see section below |

Template: `artifacts/project-novara/.env.example`

---

## Does `VITE_API_BASE_URL` exist? Is it required?

**Yes, it was added.** All API calls in the frontend now prefix with `VITE_API_BASE_URL`.

### How it works

`artifacts/project-novara/src/lib/apiBase.ts` (new file):
```ts
const raw = import.meta.env.VITE_API_BASE_URL ?? "";
export const API_BASE = raw.replace(/\/$/, "");
```

Every `fetch` in these files now prefixes with `API_BASE`:
- `artifacts/project-novara/src/lib/api.ts` (10 calls)
- `artifacts/project-novara/src/hooks/useNotifications.ts` (6 calls)
- `artifacts/project-novara/src/hooks/useCompanyNews.ts` (1 call)

Example — before vs after:
```ts
// Before (Replit-only, breaks cross-origin)
fetch("/api/contacts")

// After (works anywhere)
fetch(`${API_BASE}/api/contacts`)
```

### When to set it

| Deployment | `VITE_API_BASE_URL` value |
|---|---|
| Vercel + Render (separate domains) | `https://your-api.onrender.com` |
| Vercel + Render, using Vercel rewrites | Leave blank (`""`) — rewrites make `/api/*` work same-origin |
| Single Render service (API serves static files) | Leave blank (`""`) |
| Local dev | Leave blank (`""`) — relative `/api/...` hits the Replit proxy |

---

## API routing for separate-domain deployment

When the frontend (Vercel) and backend (Render) are on different domains you have two options:

### Option A — Set `VITE_API_BASE_URL` (simplest)

Set `VITE_API_BASE_URL=https://your-api.onrender.com` in Vercel's environment variables.  
Every `fetch` call becomes an absolute request to the Render API.  
CORS is already configured with `cors({ credentials: true, origin: true })` in `artifacts/api-server/src/app.ts`, so cross-origin requests work.

### Option B — Vercel rewrites (no env var needed)

`artifacts/project-novara/vercel.json` is included in the repo:
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://REPLACE_WITH_YOUR_RENDER_API_URL/api/:path*"
    }
  ]
}
```
Replace the destination URL with your actual Render API domain. Leave `VITE_API_BASE_URL` blank.

---

## Clerk proxy

The API server mounts a Clerk Frontend API proxy at `/api/__clerk`  
(source: `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`).

Only activates when `NODE_ENV === 'production'` AND `CLERK_SECRET_KEY` is set.

Set `VITE_CLERK_PROXY_URL=https://<your-render-api-domain>/api/__clerk` in the frontend build.

> The Clerk instance is Replit-managed. Contact the repo owner for `pk_live_` / `sk_live_` keys — they are not in the `.env.example` files.

---

## Database

- `artifacts/api-server/src/db.ts` reads `process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL`
- `lib/db/src/index.ts` reads `process.env.DATABASE_URL`
- On Render: set `DATABASE_URL` to your Neon (or other PostgreSQL) connection string
- On Replit: `NEON_DATABASE_URL` is still accepted as fallback (no Replit config change needed)
- Run schema migrations once before first deploy: `drizzle-kit push` with `DATABASE_URL` set

---

## Mobile app (`artifacts/novara-mobile`)

`app.config.js` now reads `EXPO_PUBLIC_API_BASE_URL` first, falls back to `REPLIT_DEV_DOMAIN` for backward compatibility, then `http://localhost:3000`:

```js
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:3000");
```

For production mobile builds, set:
```
EXPO_PUBLIC_API_BASE_URL=https://your-api.onrender.com
```

---

## Changes made from Replit-only to standard

| File | What changed |
|---|---|
| `artifacts/api-server/src/db.ts` | `NEON_DATABASE_URL` → `DATABASE_URL ?? NEON_DATABASE_URL` |
| `artifacts/project-novara/vite.config.ts` | Removed mandatory throws; `PORT` defaults to `5173`, `BASE_PATH` defaults to `/` |
| `artifacts/project-novara/src/lib/apiBase.ts` | **New file** — exports `API_BASE` from `VITE_API_BASE_URL` |
| `artifacts/project-novara/src/lib/api.ts` | All 10 fetch calls prefixed with `API_BASE` |
| `artifacts/project-novara/src/hooks/useNotifications.ts` | All 6 fetch calls prefixed with `API_BASE` |
| `artifacts/project-novara/src/hooks/useCompanyNews.ts` | 1 fetch call prefixed with `API_BASE` |
| `artifacts/novara-mobile/app.config.js` | Reads `EXPO_PUBLIC_API_BASE_URL` first; `expo-router` origin uses `apiBaseUrl` |
| `artifacts/project-novara/.env.example` | **New file** — all frontend env vars documented |
| `artifacts/api-server/.env.example` | **New file** — all backend env vars documented |
| `artifacts/project-novara/vercel.json` | **New file** — Vercel rewrite rule template for `/api/*` proxy |

---

## Quick-start checklist

### Render (API)
- [ ] Create Web Service → repo root, build command above, start command above
- [ ] Set all env vars from the backend table above
- [ ] Note the service URL (e.g. `https://novara-api.onrender.com`)
- [ ] `DATABASE_URL` points to a provisioned Neon project
- [ ] Run `drizzle-kit push` once to apply schema

### Vercel (frontend)
- [ ] Create project → `artifacts/project-novara` as root directory
- [ ] Build command: `cd ../.. && pnpm install && pnpm --filter @workspace/project-novara run build`
- [ ] Output directory: `dist/public`
- [ ] Set env vars from the frontend table above
- [ ] Either: set `VITE_API_BASE_URL=https://novara-api.onrender.com`
- [ ] Or: update `vercel.json` destination URL and leave `VITE_API_BASE_URL` blank

### VAPID (push notifications, optional)
```sh
npx web-push generate-vapid-keys
```
Copy the output into `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` on Render.
