# Exact Render Environment Variables

Two separate Render services. Set these in each service's **Environment** tab.
`sync:false` in `render.yaml` means "set manually in dashboard" (secrets). Values
here are placeholders — real values live only in Render.

## Backend service (`novara-prod-api`)

| Variable | Value | Secret | Notes |
|---|---|---|---|
| `NODE_ENV` | `production` | No | |
| `PORT` | (Render injects) | No | Do not hardcode. |
| `DATABASE_URL` | Neon **production** pooled URL | **Yes** | `…-pooler.neon.tech`, `sslmode=require`. Never the pilot DB. |
| `CLERK_PUBLISHABLE_KEY` | `pk_live_…` | No | Production Clerk instance. |
| `CLERK_SECRET_KEY` | `sk_live_…` | **Yes** | Production Clerk instance. |
| `FRONTEND_URL` | `https://app.novaraconnect.group` | No | Exact origin, no trailing slash. Drives CORS + Clerk authorizedParties. |
| `GNEWS_API_KEY` | production key | **Yes** | Consider a separate/paid key (100/day free cap). |
| `VAPID_PUBLIC_KEY` | new prod key | No | Generate a NEW keypair. |
| `VAPID_PRIVATE_KEY` | new prod key | **Yes** | |
| `VAPID_SUBJECT` | `mailto:hello@novaraconnect.group` | No | |
| `RESEND_API_KEY` | production key | **Yes** | Optional (feedback still saves without it). |
| `RESEND_FROM_EMAIL` | `feedback@novaraconnect.group` | No | Verify the domain in Resend first. |
| `FEEDBACK_TO_EMAIL` | `novaraconnect@gmail.com` | No | |
| `LOG_LEVEL` | `info` | No | |

## Frontend static site (`novara-prod-web`) — build-time, NOT secret

| Variable | Value | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `https://api.novaraconnect.group` | Backend origin. |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_…` | Production Clerk. |
| `VITE_CLERK_PROXY_URL` | `https://api.novaraconnect.group/api/__clerk` | Must match backend origin. |

> ⚠️ Vite bakes `VITE_*` into the static bundle. After changing any of these, **rebuild/redeploy** the static site — a restart alone won't pick them up.

## Generate a VAPID keypair
```bash
npx web-push generate-vapid-keys
```
