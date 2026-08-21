# Test Environment Runbook (isolated from pilot AND production)

Goal: a throwaway test stack to validate the mobile data-layer milestone end-to-end
without touching the pilot or production. Three isolated resources:

- **Test Neon branch/DB** — empty + schema only (NO real user data).
- **Test Clerk Development instance** — `pk_test_`/`sk_test_`.
- **Test Render backend** — `novara-test-api`, deployed from `NovaraConnect/Novara_Production`.

> Steps marked 🔴 require entering a SECRET (connection string / Clerk secret key).
> Claude cannot type secrets into fields — you (or your password manager) do those.
> Steps marked 💳 create billable/real resources — you approve/own them.

---

## 1. Neon — test database  (💳 free tier is fine)
Recommended: an **empty** branch so no pilot user data is copied.
1. Neon Console → your project → **Branches → New branch** → name `test`.
   - Prefer creating it **without data** (empty), or create then TRUNCATE the copied
     tables in the `test` branch only. Do not use a branch that carries real users.
2. Create a test role/password (don't reuse pilot creds).
3. 🔴 Copy the **pooled** connection string (`…-pooler.neon.tech`, `?sslmode=require`).
4. Apply the schema (safe, idempotent):
   ```bash
   psql "$TEST_DATABASE_URL" -f docs/production/schema/production_schema.sql
   psql "$TEST_DATABASE_URL" -c "\dt"   # contacts, feedback, push_subscriptions, user_settings
   ```

## 2. Clerk — test Development instance
1. Clerk Dashboard → create a **Development** instance (or a dedicated test app).
2. Allowed origins/redirects: add `http://localhost:*`, the Expo dev URL, and
   `novara://` (the app scheme) so the mobile sign-in redirect works.
3. 🔴 Copy `pk_test_…` (publishable) and `sk_test_…` (secret).

## 3. Render — test backend  (💳 pick Free for cheapest, or Starter for no cold start)
Create a new **Web Service** from `NovaraConnect/Novara_Production`:
- Branch: `main`
- Build:  `pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build`
- Start:  `pnpm --filter @workspace/api-server run start`
- Health check path: `/api/healthz`
- Name: `novara-test-api`
- Auto-Deploy: OFF (deploy manually while testing)
- Environment variables (🔴 = secret, you enter):
  | Key | Value |
  |---|---|
  | `NODE_ENV` | `production` |
  | `DATABASE_URL` 🔴 | test Neon pooled URL |
  | `CLERK_PUBLISHABLE_KEY` | `pk_test_…` |
  | `CLERK_SECRET_KEY` 🔴 | `sk_test_…` |
  | `FRONTEND_URL` | `http://localhost:8081` (Expo) or your test web origin |
  | `GNEWS_API_KEY` 🔴 | any test/free GNews key (optional) |
  | `RESEND_API_KEY` 🔴 | optional |
  | `FEEDBACK_TO_EMAIL` | your email |
- After first deploy: `curl https://novara-test-api.onrender.com/api/healthz`
  → expect `{status:"ok", databaseConnected:true}` and no `missingEnvVars`.

## 4. Point the mobile app at the test stack (local, no secrets in git)
Edit `artifacts/novara-mobile/.env.local` (gitignored):
```
EXPO_PUBLIC_API_BASE_URL=https://novara-test-api.onrender.com
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_<test instance>
```
Then `npx expo start -c`.

## 5. Test plan for the data-layer milestone
1. Sign up a fresh test user (test Clerk) → lands on tabs.
2. Contacts tab loads from the test backend (empty for a new user).
3. If you have on-device contacts, the **import banner** shows → tap **Import**
   → verify `{imported, skipped}` and that contacts now appear.
4. Add / edit / delete / mark-contacted a contact → each round-trips (reload persists).
5. Settings: set career statement + a goal tag → reload → persists (via `/api/settings`).
6. Confirm the local AsyncStorage copy is untouched (backup retained).
7. Sign out → sign back in → data still present (server-side).

## Isolation guarantees
- Test Neon branch/DB ≠ pilot DB; empty + schema only.
- Test Clerk instance ≠ pilot Clerk; test users only.
- `novara-test-api` ≠ pilot `Novara-Mobile2`; separate Render service.
- Nothing here modifies pilot Render/Neon/Clerk or production.
