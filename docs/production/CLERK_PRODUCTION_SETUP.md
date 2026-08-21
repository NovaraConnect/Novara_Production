# Clerk — Production Instance Setup

The pilot uses a Clerk **development** instance (`pk_test_`/`sk_test_`). Production
needs a **production instance** (`pk_live_`/`sk_live_`) — Clerk requires this for
real users and a custom domain. Never promote the dev instance.

## Steps  ⚠️ NEEDS APPROVAL before changing the live Clerk account
1. Clerk Dashboard → create/enable the **Production** instance for the Novara app.
2. Set the production **Frontend API / custom domain** (Clerk will provide DNS records — CNAMEs on `clerk.novaraconnect.group` or similar). Complete DNS verification.
3. Configure **allowed origins / redirect URLs**:
   - `https://app.novaraconnect.group` (frontend)
   - `https://api.novaraconnect.group` (backend proxy origin)
4. Copy keys:
   - `pk_live_…` → `CLERK_PUBLISHABLE_KEY` (backend) and `VITE_CLERK_PUBLISHABLE_KEY` (frontend).
   - `sk_live_…` → `CLERK_SECRET_KEY` (backend, secret).
5. Confirm the backend's `authorizedParties` matches `FRONTEND_URL` (the app already wires `authorizedParties: [FRONTEND_URL]`).
6. Enable the sign-in methods you want for production (email/password, OAuth, etc.). Set up a real support/email sender if Clerk emails go to users.

## Verify
- Sign up a brand-new user on `https://app.novaraconnect.group`.
- Backend logs show a verified session (no 401 loop).
- `GET /api/healthz` reports no missing Clerk vars.

## Important: user IDs differ from pilot
Production Clerk issues **new** `user_id`s. Pilot data cannot be copied without
remapping `user_id` — see `DATA_MIGRATION.md`.
