# Plan: Add Clerk Auth to the Novara Expo App

**Status: PLAN ONLY. No code written, no packages installed, no external service touched.**
Grounded in the current source. Goal: make the mobile app authenticate like the web
app and use the production backend (authenticated, per-user data) instead of local
device storage.

---

## 1. Screens that currently exist (expo-router)
- `app/_layout.tsx` — root: fonts, splash, React Query, ErrorBoundary, `<Stack>`. **No auth.**
- `app/(tabs)/_layout.tsx` — native tab bar: **index** (dashboard), **contacts**, **add**, **settings**.
- `app/(tabs)/index.tsx` — dashboard/home.
- `app/(tabs)/contacts.tsx` — contact list.
- `app/(tabs)/add.tsx` — add contact.
- `app/(tabs)/settings.tsx` — career statement + goal tags (local profile).
- `app/contact/[id].tsx` — contact detail (also does mailto/tel/URL `Linking`).
- `app/contact/edit/[id].tsx` — edit contact.
- `app/+not-found.tsx` — 404.

There is **no sign-in / sign-up screen today**.

## 2. Where contacts are stored now
100% **on-device via AsyncStorage** (`lib/storage.ts`):
- Key `novara_contacts` — array of `Contact` (client-generated `id` via `generateId()`).
- Key `novara_profile` — `{ careerStatement, goalTags }`.
- `seedDataIfNeeded()` seeds 5 demo contacts on first run.
- `hooks/useContacts.ts` and `hooks/useProfile.ts` are the only data access points — all local, no network.
- `lib/notifications.ts` is **local notifications only** (no backend subscribe calls).
- The mobile `Contact` type (`types/contact.ts`) is camelCase and a near-subset of the backend contact shape.

## 3. Backend endpoints and their auth requirement
Auth-gated (`requireAuth`, need `Authorization: Bearer <clerk-token>`):
- Contacts: `GET/POST /api/contacts`, `POST /api/contacts/recalculate`, `GET/PUT/DELETE /api/contacts/:id`, `POST /api/contacts/:id/mark-contacted`, **`POST /api/contacts/import`**
- Settings: `GET/PUT /api/settings`
- Notifications: `GET/PUT /api/notifications/settings`, `POST/DELETE /api/notifications/subscribe`, `POST /api/notifications/test`
- Feedback: `POST /api/feedback`
- News: `GET /api/company-news`

Open (no auth): `GET /api/healthz`, `GET /api/notifications/vapid-public-key`.

> The current mobile `lib/api.ts` calls `/api/company-news` with **no token** → it will 401 until auth is added. This plan fixes that.
>
> (An `importFromLinkedIn` client calling `POST /api/linkedin/import` used to be listed here too. That route and both of its clients were removed in PR #9 — profile import is now a client-side-OCR screenshot flow.)

## 4. Packages to add
Install with `npx expo install` (picks SDK-54-compatible versions), and add to the
workspace catalog in `pnpm-workspace.yaml` so versions are pinned centrally:
- **`@clerk/clerk-expo`** — Clerk provider + hooks for React Native/Expo.
- **`expo-secure-store`** — Clerk token cache backed by the iOS Keychain (secure).
- (Already present, reused: `expo-web-browser`, `expo-linking`, `expo-constants`.)

Notes / risks:
- Workspace pins `react@19.1.0` / `react-dom@19.1.0` and `expo@~54`. Confirm the
  chosen `@clerk/clerk-expo` supports Expo SDK 54 + React 19 (recent versions do).
- `pnpm-workspace.yaml` has `minimumReleaseAge: 1440` (supply-chain guard). If a
  needed version is newer than 1 day, either wait or add a scoped exception — do
  **not** disable the guard.
- Installing touches npm (external). Per the local-only constraint, do this only
  when you approve the package add.

## 5. Environment variables
- **`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`** — Clerk publishable key (`pk_live_…` for prod,
  `pk_test_…` for dev). `EXPO_PUBLIC_` prefix = available at runtime in the app.
  Set per build profile in `eas.json` (`env` block), like `EXPO_PUBLIC_API_BASE_URL`.
- Reuse existing **`EXPO_PUBLIC_API_BASE_URL`** (already wired via `app.config.js` → `extra.apiBaseUrl`).
- **No secret key on the client** — mobile never sees `CLERK_SECRET_KEY` (that lives only on the backend).
- Mobile does **not** use the web app's `VITE_CLERK_PROXY_URL` — native apps send bearer
  tokens directly; the Clerk proxy was a web/cookie concern.

## 6. app.config.js scheme / deep-link changes
- `scheme: "novara"` is **already set** (this plan needs it for the OAuth/redirect callback).
- Clerk Expo uses the scheme for the hosted sign-in redirect back into the app
  (`novara://`). Actions required in Clerk (external, later): add `novara://` (and the
  Expo dev proxy URL) to the instance's allowed redirect URLs.
- If using OAuth (Google, etc.), add `expo-web-browser` `maybeCompleteAuthSession()` and
  Clerk's `useOAuth` flow. For email/password only, no OAuth redirect is needed.
- No other `app.config.js` change required (bundle id, permissions already set).

## 7. Sign-in / sign-up / sign-out flow
- **Provider**: wrap the root in `app/_layout.tsx`:
  `<ClerkProvider publishableKey={EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY} tokenCache={secureStoreTokenCache}>`
  (tokenCache uses `expo-secure-store` → Keychain).
- **Auth gate**: add an auth group. New `app/(auth)/sign-in.tsx` and `app/(auth)/sign-up.tsx`.
  In `app/_layout.tsx`, use Clerk's `<SignedIn>` / `<SignedOut>` (or `useAuth().isSignedIn`)
  to route: signed-out → `(auth)`, signed-in → `(tabs)`. Keep the splash until
  `isLoaded` to avoid a flicker.
- **Sign-in**: `useSignIn()` — email/password (and/or OAuth via `useOAuth`).
- **Sign-up**: `useSignUp()` — create user + email verification code, then `setActive`.
- **Sign-out**: `useAuth().signOut()` — add a "Sign out" button to `app/(tabs)/settings.tsx`
  (natural home; it already has the profile section). On sign-out, clear React Query cache.

## 8. Passing getToken() to API calls
Current `lib/api.ts` uses a bare `fetch` with no auth. Mirror the web app's
`apiFetch(getToken, path)` pattern:
- Add an `authedFetch` that accepts a `getToken` function:
  ```ts
  export async function authedFetch(getToken, path, init = {}) {
    const token = await getToken();            // Clerk session token
    if (!token) throw new Error("Unauthorized");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${getApiBase()}${path}`, { ...init, headers });
  }
  ```
- Get `getToken` from Clerk's `useAuth()` inside hooks/components, then pass it down
  (or wrap in a small `useApi()` hook that closes over `getToken`).
- Backend already verifies these bearer tokens (`requireAuth` → Clerk `getAuth`), and the
  web app proves the exact same header works — so no backend change is needed.
- Update `getCompanyNews` in `lib/api.ts` to use `authedFetch`.

## 9. Migrating existing local contacts into the authenticated backend
The backend already has the ideal endpoint: **`POST /api/contacts/import`** accepts
`{ contacts: [...] }` in the **same camelCase shape the mobile `Contact` type already uses**
(firstName, lastName, company, role, metAt, importance, initialFollowUpDays,
followUpCadenceDays, notes, createdAt, lastInteractionDate, nextFollowUpDate…), runs each
through the canonical priority/cadence logic, and dedups with `ON CONFLICT DO NOTHING`.

One-time migration flow (client-side, after first sign-in):
1. On first authenticated launch, read local `novara_contacts` from AsyncStorage.
2. Filter out the seed/demo rows (or skip migration if only seed data is present).
3. `POST /api/contacts/import` with `{ contacts }` and the bearer token.
4. On success, mark a local flag (e.g. `novara_migrated_v1 = true`) so it runs once.
5. Then switch the app's data source from AsyncStorage to the backend (see step plan).
- **Non-destructive**: keep the local copy until the user confirms; import is idempotent.
- **Profile**: local `novara_profile` (careerStatement, goalTags) maps to `PUT /api/settings`.

## 10. Step-by-step implementation plan + risks
Ordered so each step is independently testable. All local except the two external
prerequisites (Clerk redirect config, package install), which are flagged.

1. **[external] Add packages** — `npx expo install @clerk/clerk-expo expo-secure-store`; pin in catalog. *Risk: touches npm + minimumReleaseAge guard.*
2. **Token cache** — `lib/tokenCache.ts` using expo-secure-store. *Risk: low.*
3. **Provider + env** — wrap `app/_layout.tsx` in `ClerkProvider`; add `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` to `eas.json` profiles. *Risk: low; needs the key value.*
4. **Auth screens + gate** — `app/(auth)/sign-in.tsx`, `sign-up.tsx`; route via `isSignedIn`. *Risk: routing edge cases (loading flicker, deep links). Test signed-out/in transitions.*
5. **Sign-out** — button in settings; clear React Query cache. *Risk: low.*
6. **`authedFetch`** — add to `lib/api.ts`; convert `getCompanyNews`. *Risk: low; verify 200s against a real token.*
7. **Backend-backed data hooks** — new `useContacts`/`useProfile` that call `/api/contacts*` and `/api/settings` with `authedFetch`, replacing AsyncStorage CRUD. Keep the mobile `Contact` mapping to the API response. *Risk: HIGHEST — field-shape drift between mobile `Contact` and API DTO (e.g. base/current priority, dates as `YYYY-MM-DD` vs ISO). Add a mapping layer + typecheck.*
8. **One-time migration** — on first authed launch, import local contacts via `/api/contacts/import`; set `novara_migrated_v1`. *Risk: double-import (mitigated by dedup + flag); seed rows (filter them).*
9. **[external, later] Clerk redirect config** — add `novara://` to allowed redirects in the Clerk instance (only if using OAuth). *Risk: external; not needed for email/password.*
10. **Verify** — `tsc` typecheck; run in Expo Go / dev client against the prod backend; confirm sign-up → add contact → reload → persists server-side; confirm `/company-news` returns 200 with a token.

### Cross-cutting risks
- **React 19 / Expo 54 / Clerk compat** — verify versions before wide changes.
- **Offline behavior** — moving off AsyncStorage removes offline use; decide whether to keep a cached/offline layer (React Query persistence) or require connectivity.
- **App Review** — reviewers need a working demo account + the app must function end-to-end; this plan is what makes that possible.
- **Data-shape drift (step 7)** is the main correctness risk — mitigate with an explicit DTO↔Contact mapper and typecheck, mirroring `lib/api-client-react` on the web side.

---

### What I will NOT do without your go-ahead
- Install any package (touches npm).
- Configure Clerk redirect URLs (touches the Clerk account).
- Run EAS build or submit to Apple.
- Push to GitHub.

When you approve, the safe first coding milestone is steps 2–6 (provider, token cache,
auth screens, sign-out, `authedFetch`) — all local once the packages are installed —
leaving the data-source switch (step 7) and migration (step 8) as a reviewable second pass.
