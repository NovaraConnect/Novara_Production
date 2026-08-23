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

## Optional — Business-card AI text parser (`novara-prod-api`)

All optional. If unset, the app works exactly as before (deterministic
business-card parsing only); the backend still starts and the endpoint returns
a graceful `{ ok:false, reason:"ai_disabled" }`.

| Variable | Value | Notes |
|---|---|---|
| `CARD_AI_PARSE` | `on` | Enables `POST /api/parse-card-text`. Off/unset ⇒ feature disabled. |
| `CARD_AI_PROVIDER` | `anthropic` \| `gemini` | Optional. If unset, prefers Anthropic when its key is present, else Gemini. |
| `ANTHROPIC_API_KEY` | `sk-ant-…` | Provider credential (Cloe sets it). No training on API inputs. |
| `GEMINI_API_KEY` | `…` | Provider credential (Cloe sets it). **Must be a paid / no-training setup.** |
| `CARD_AI_ANTHROPIC_MODEL` | `claude-haiku-4-5` | Optional model override. |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Optional model override. |

> ⚠️ **Privacy:** business-card OCR text can include names, emails, phones,
> addresses. The image is **never** sent — OCR runs on the device and only the
> text is posted. **Do NOT use the Gemini *free* tier** for real card text (it
> trains on submitted content). Use **Anthropic** or a **paid / no-training
> Gemini** project where submitted content is not used to improve Google
> products. The endpoint never logs the OCR text or parsed fields.
