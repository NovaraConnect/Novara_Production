# 08 — Authentication

See also: `diagrams/auth-flow.mmd`.

## Provider

[Clerk](https://clerk.com) is the sole identity provider, for both the web frontend and the
backend. There is no separate session/user table in Novara's own database — Clerk owns identity
entirely; Novara's Postgres tables reference users only by their Clerk `user_id` string (no foreign
key, since Clerk is external — see `03-Database.md`).

## Frontend integration

`App.tsx` wraps the whole app in `<ClerkProvider>` (`@clerk/react`), configured with:

- `publishableKey` — resolved via `publishableKeyFromHost(window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)`, i.e. Clerk's SDK picks the correct instance based
  on the current hostname, not a single hardcoded key.
- `proxyUrl` — `VITE_CLERK_PROXY_URL`, pointing Clerk's Frontend API traffic through the backend
  (see below) instead of directly to `clerk.dev`/`clerk.com`.
- `routerPush`/`routerReplace` — wired to wouter's `setLocation` (via `stripBase()`), so Clerk's
  internal navigation (e.g. after sign-in) uses the app's own client-side router rather than a full
  page reload.
- `signInUrl`/`signUpUrl` — `${basePath}/sign-in`, `${basePath}/sign-up`.
- Custom `appearance` (theme `shadcn` from `@clerk/themes`, plus a hand-tuned color/typography
  override matching Novara's own design tokens) and `localization` (custom copy for the sign-in/
  sign-up screen titles).

`SignIn.tsx`/`SignUp.tsx` render Clerk's `<SignIn>`/`<SignUp>` components with
`forceRedirectUrl={`${basePath}/dashboard`}`, so a successful auth always lands the user on the
dashboard regardless of where they started the flow.

Route protection on the frontend is declarative: `ProtectedRoute` wraps a page component in
Clerk's own `<Show when="signed-in">`/`<Show when="signed-out">` components (not a custom
`isSignedIn` check), redirecting to `/` when signed out.

## Token flow

The frontend obtains a session token via Clerk's `useAuth().getToken()` and attaches it as
`Authorization: Bearer <token>` on every API call (`apiFetch` in `lib/api.ts`). If `getToken()`
resolves to nothing, `apiFetch` throws `"Unauthorized"` client-side before ever making the network
request.

## Backend integration

`app.ts` mounts Clerk's own `clerkMiddleware` (`@clerk/express`) globally, resolving the
publishable key per-request:

```ts
clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(getClerkProxyHost(req) ?? "", process.env.CLERK_PUBLISHABLE_KEY),
}))
```

This middleware verifies the incoming Bearer token and attaches auth state to the request, but does
**not** itself reject unauthenticated requests — that's `requireAuth`'s job (`middlewares/auth.ts`),
applied individually per route. Routes that don't call `requireAuth`
(`GET /api/healthz`, `GET /api/company-news`, `POST /api/linkedin/import`,
`GET /api/notifications/vapid-public-key`) are reachable without any session at all — see
`04-API.md` and `12-Security.md`.

## The Clerk proxy (`clerkProxyMiddleware.ts`)

Rather than the frontend talking to Clerk's Frontend API (`frontend-api.clerk.dev`) directly, all
such traffic is proxied through the backend at `/api/__clerk`. Per the file's own header comment,
this exists so Clerk authentication works "on custom domains and `.replit.app` deployments without
requiring CNAME DNS configuration," and so "Clerk's dashboard-configured domain" stays aligned with
the backend's own domain. The proxy:

- Only activates when `NODE_ENV === "production"` and `CLERK_SECRET_KEY` is set; it's a
  pass-through no-op otherwise (so local/dev environments don't need this complexity).
- Determines the "canonical" client-facing hostname via `getClerkProxyHost()`, which prefers
  `x-forwarded-host` over the raw `Host` header (taking the leftmost value if multiple proxy hops
  appended rather than replaced the header) — this same function is shared between the proxy
  middleware and the `clerkMiddleware` publishable-key resolution in `app.ts`, specifically so both
  agree on which hostname is authoritative (the file's comment notes multi-domain flows would break
  otherwise).
- Forwards the real client IP via `X-Forwarded-For` and sets `Clerk-Proxy-Url`/`Clerk-Secret-Key`
  headers Clerk's proxy protocol expects.
- **Must be mounted before `express.json()`** in `app.ts` (and is) — proxied requests need their
  raw body, not a pre-parsed one.

## User model

There is no local "users" table. The Clerk `user_id` (a string, e.g. `user_xxx`) is the only user
identifier stored anywhere in Novara's database, present as a plain (non-foreign-key) column on
`contacts`, `user_settings`, `push_subscriptions`, and `feedback`. User profile data (name, email,
avatar) is read from Clerk's own client SDK (`useUser()`) where displayed in the UI — e.g. the
feedback form prefilling `contactEmail` from `user?.primaryEmailAddress?.emailAddress`. Nothing in
the backend stores a duplicate copy of Clerk profile fields.

## Session handling

Session lifecycle (issuance, refresh, expiry) is entirely Clerk's responsibility — no custom
session/JWT logic exists in this codebase. `ClerkQueryClientCacheInvalidator` (in `App.tsx`)
listens for Clerk auth-state changes and calls `queryClient.clear()` whenever the signed-in user ID
changes (including sign-out → different-user sign-in), preventing one user's cached
contacts/settings from leaking into another user's session on a shared device.

## Security assumptions, stated explicitly

1. **`userId` is trusted only when it comes from `getAuth(req)`, never from any client-supplied
   value.** Verified true in every route reviewed (`04-API.md`, `05-Business-Rules.md` rule 11).
2. **Clerk instance alignment is load-bearing.** The repo's own prior incident history
   (`INCIDENT_RESPONSE.md`, `ARCHITECTURE.md`) describes a real production outage where the
   frontend and backend were configured against two different Clerk instances (`coherent-lionfish-59`
   vs. `smooth-bedbug-72`), making every session token issued by one meaningless to the other — a
   silent, total authentication failure. The documented fix was aligning both to one instance and
   adding `authorizedParties` to the backend's `clerkMiddleware` config. **Note:** direct reading of
   the `clerkMiddleware` call in this working copy's `app.ts` shows no `authorizedParties` option
   configured — only the `publishableKey` resolver. Whether this fix is present depends on which
   version of the repository is authoritative; see the caveat in `00-README.md`.
3. **The feedback route's `contactEmail` field is explicitly documented as non-authoritative** —
   its own code comment states it is "a UX sanity check ... not a security boundary. Never used to
   authenticate."

## What a future engineer needs to know before touching auth

- Changing `CLERK_PUBLISHABLE_KEY` (backend) or `VITE_CLERK_PUBLISHABLE_KEY` (frontend) without
  changing both together, consistently, to the same Clerk instance, is exactly how the
  previously-documented outage happened.
- The proxy path (`/api/__clerk`) and its before-`express.json()` mounting order are both
  load-bearing; moving `clerkProxyMiddleware` after `express.json()` would break it for
  proxied requests that need a raw body.
- There is no local password/credential storage anywhere in this codebase to worry about — Clerk
  owns all of that.
