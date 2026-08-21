# Phase 2 — Production Infra Setup (Neon + Clerk + Render + Domains)

> **Working model: "I prep, you click."** Every ⚠️ step touches a live external
> account, so **you** perform it in the dashboard.
>
> **🔐 Secrets handling — no secrets in chat.** You enter all secrets
> (DB URLs, `sk_live_`, API keys, VAPID private key) **directly into
> Render/Neon/Clerk**. Never paste a secret back to me. Where I need to proceed,
> I'll ask you to **confirm** a value is set (✅ **CONFIRM**) — not to reveal it.
> The only non-secret values I may ask you to share are public identifiers
> (publishable `pk_live_…`, service URLs, hostnames).
>
> **Repo:** `NovaraConnect/Novara_Production` — this clean-history repo's **`main`
> branch IS production**. Render deploys from `main`. (Ignore the older
> "create a `production` branch" note in `DEPLOYMENT_PRODUCTION.md` §0/§3 — that
> was written for the `Novara-Mobile2` lineage where `main` = pilot.)
>
> **Domain:** `novaraconnect.group` — frontend `app.novaraconnect.group`,
> backend `api.novaraconnect.group`.
>
> **Do NOT touch pilot services** (`Novara-Mobile2` backend/frontend on Render,
> the pilot Neon branch, the pilot Clerk *development* instance).

Order is strict: **Neon → Clerk → Backend → Frontend → Domains → Verify.**
Nothing here depends on the pilot; nothing here modifies the pilot.

---

## 0. Prerequisites (you)
- [ ] Access to: Neon Console, Clerk Dashboard, Render Dashboard, and the DNS
      registrar for `novaraconnect.group`.
- [ ] A production **GNews** key, **Resend** key (optional), and you'll generate
      a fresh **VAPID** keypair below.

---

## 1. Neon — production database  ⚠️
**Requirement: production must be SCHEMA-ONLY / NO DATA.** Do **not** create a
normal Neon branch off the pilot — a normal branch is a copy-on-write clone that
**carries pilot data**. Start from an empty database and apply our schema.

1. Create an **empty** production database, one of:
   - **Preferred:** Neon Console → Novara project → **Branches** → **New branch**,
     and choose the option that creates it **empty / without data** (schema-only,
     no parent data). If the UI only offers a data-carrying branch, use the next option.
   - **Alternative:** create a **separate empty database** (new branch/project) that
     was never cloned from pilot.
   - ❌ Not allowed: branch from the pilot and keep its rows.
2. Create a dedicated role/password for production (do **not** reuse pilot creds).
3. Copy the **pooled** connection string — the host must contain `-pooler.neon.tech`
   and end with `?sslmode=require`. **This is a secret → it goes into Render only.**
4. Apply the schema (run locally with the prod URL in your own shell):
   ```bash
   psql "$PROD_DATABASE_URL" -f docs/production/schema/production_schema.sql
   psql "$PROD_DATABASE_URL" -c "\dt"    # expect: contacts, feedback, push_subscriptions, user_settings
   psql "$PROD_DATABASE_URL" -c "SELECT count(*) FROM contacts;"        # MUST be 0
   psql "$PROD_DATABASE_URL" -c "SELECT count(*) FROM user_settings;"   # MUST be 0
   ```
5. Enable PITR / history retention on the production branch before real users.

✅ **CONFIRM to me (no secrets):** "Neon production created empty; schema applied;
4 tables present; contacts & user_settings both 0 rows." (Do **not** send the URL.)

---

## 2. Clerk — production instance  ⚠️
You already have a Clerk app/instance:
`https://dashboard.clerk.com/apps/app_3G8eb9c3E8fowl5mhBcNPijVihM/instances/ins_3HgL7JT9IRpVvZctbfAh668FRU0`

**First, verify it is a PRODUCTION instance, not development:**
- The instance's publishable key must start with **`pk_live_`** (dev = `pk_test_`).
- If that instance is `pk_test_`, create/enable the **Production** instance for this
  app instead (Clerk requires `pk_live_`/`sk_live_` for real users).
  **Never promote the pilot dev instance.**

**Custom Clerk domain is OPTIONAL for now.** First target: get
`app.novaraconnect.group` + `api.novaraconnect.group` working with the Clerk
**production keys**. Only set up a Clerk custom domain (e.g. `clerk.novaraconnect.group`)
**if Clerk requires it** for your production instance / chosen sign-in methods. If it
isn't required, skip it and proceed — we can add it later without rework.

In the production instance:
1. **Allowed origins / redirect URLs** — add all of:
   - `https://app.novaraconnect.group`   (frontend)
   - `https://api.novaraconnect.group`   (backend proxy origin)
   - `https://localhost`                 (**Capacitor iOS webview origin — Phase 4;**
     adding it now avoids a second Clerk visit later)
2. **Sign-in methods**: enable what you want for production (email/password, OAuth…).
   If you enable OAuth, note it needs extra handling inside the iOS webview (Phase 4).
3. **(Only if Clerk requires a custom domain)** set it and add the CNAME it shows at
   your registrar; let Clerk verify. Otherwise skip.
4. Get the keys from **API Keys** and enter them where noted in steps 3–4 (backend/
   frontend). `sk_live_` is a **secret → Render only**.

✅ **CONFIRM to me:** "Clerk instance is production (`pk_live_`)." You **may** share
the public `pk_live_…` (it's a publishable, non-secret value) so I can sanity-check
the frontend/backend wiring. Also tell me whether a Clerk custom domain was required.

> ⚠️ Production Clerk issues **new** `user_id`s — pilot data cannot be copied
> without remapping. We're starting production empty, so this is fine.

---

## 3. Backend — new Render Web Service  ⚠️
New **Web Service**, connected to `NovaraConnect/Novara_Production`, branch **`main`**.
Suggested name: **`novara-prod-api`**.

| Setting | Value |
|---|---|
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build` |
| Start command | `pnpm --filter @workspace/api-server run start` |
| Health check path | `/api/healthz` |
| Plan | **Starter or higher** (never Free — cold starts break the notification cron) |
| Auto-Deploy | **OFF** for now (manual deploys until production is proven) |

**Environment variables** (Environment tab). Secrets marked 🔒 — **you enter these
directly in Render; never share them with me:**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` 🔒 | Neon **production** pooled URL (from step 1) |
| `CLERK_PUBLISHABLE_KEY` | `pk_live_…` (step 2) |
| `CLERK_SECRET_KEY` 🔒 | `sk_live_…` (step 2) |
| `FRONTEND_URL` | `https://app.novaraconnect.group` (exact, no trailing slash) |
| `GNEWS_API_KEY` 🔒 | production GNews key |
| `VAPID_PUBLIC_KEY` | new prod key (below) |
| `VAPID_PRIVATE_KEY` 🔒 | new prod key (below) |
| `VAPID_SUBJECT` | `mailto:hello@novaraconnect.group` |
| `RESEND_API_KEY` 🔒 | production Resend key (optional — feedback saves without it) |
| `RESEND_FROM_EMAIL` | `feedback@novaraconnect.group` (verify domain in Resend first) |
| `FEEDBACK_TO_EMAIL` | `novaraconnect@gmail.com` |
| `LOG_LEVEL` | `info` |

Do **not** set `PORT` — Render injects it.

Generate the VAPID keypair (run locally; enter both values into Render yourself):
```bash
npx web-push generate-vapid-keys
```

Deploy once, then check the health endpoint:
```bash
curl -s https://<render-backend-url>/api/healthz
# expect {"status":"ok","databaseConnected":true} and NO missingEnvVars
```

✅ **CONFIRM to me (non-secret):** the Render backend URL (e.g.
`https://novara-prod-api.onrender.com`) and the `/api/healthz` JSON output
(that response contains no secrets).

---

## 4. Frontend — new Render Static Site  ⚠️
New **Static Site**, same repo, branch **`main`**. Suggested name: **`novara-prod-web`**.

| Setting | Value |
|---|---|
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @workspace/project-novara run build` |
| Publish directory | `artifacts/project-novara/dist/public` |

**Build-time env vars** (⚠️ these bake into the bundle — after any change you must
**rebuild**, not just restart). None of these are secret (`VITE_*` is public by design):

| Variable | Value |
|---|---|
| `PORT` | `5173` (build-time only; vite.config requires it to exist) |
| `BASE_PATH` | `/` |
| `VITE_API_BASE_URL` | `https://api.novaraconnect.group` |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_…` |
| `VITE_CLERK_PROXY_URL` | `https://api.novaraconnect.group/api/__clerk` |

> The Linux build here is the **authoritative** frontend build (local macOS builds
> need injected native binaries — see Phase 1 notes). If this build fails, capture
> the Render build log and send it to me.

✅ **CONFIRM to me:** the Render static-site URL and whether the build succeeded.

---

## 5. Custom domains  ⚠️
1. Render backend service → **Settings → Custom Domains** → add
   `api.novaraconnect.group`. Add the CNAME Render shows at your registrar.
2. Render static site → add `app.novaraconnect.group`. Add its CNAME.
3. Wait for both to verify (TLS issued).
4. Confirm the env values already point at the custom domains (they do, from steps
   3–4): `FRONTEND_URL`, `VITE_API_BASE_URL`, `VITE_CLERK_PROXY_URL`. If you
   temporarily launched on `*.onrender.com`, update these to the custom domains and
   **rebuild the frontend**.
5. Confirm Clerk allowed origins include both custom domains (step 2).

✅ **CONFIRM to me:** "both domains verified" once TLS is green.

---

## 6. Production smoke test (I run / verify with you)
1. `GET https://api.novaraconnect.group/api/healthz` → `{status:"ok", databaseConnected:true}`, no `missingEnvVars`.
2. Load `https://app.novaraconnect.group`, **sign up a fresh user** (prod Clerk),
   add a contact, reload → contact persists (Bearer token → prod backend → Neon prod).
3. `GET /api/company-news?...` with **no token** → **401** (auth gate holds).
4. Submit feedback → row in `feedback`; email delivered if Resend configured.

Passing all four = **Phase 3 (verify prod with real auth/data) complete**, and we
move to Phase 4 (the Capacitor iOS wrapper against `https://api.novaraconnect.group`).

---

## What I still owe you after this
- Wire any config that must live in the repo (none expected — all prod values are
  Render-side secrets), and update the deploy-state memory.
- Phase 4 kickoff: add `https://localhost` to the **backend** `ALLOWED_ORIGINS`
  (code change in `artifacts/api-server/src/app.ts`) — Clerk side is already handled
  in step 2 above.
