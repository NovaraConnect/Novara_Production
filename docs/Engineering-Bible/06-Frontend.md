# 06 — Frontend

Covers `artifacts/project-novara`, the production web app (React 19 + Vite 7, TypeScript, Tailwind
4, shadcn/Radix UI components, wouter for routing, TanStack Query for server state, Clerk React SDK
for auth). `artifacts/novara-mobile` (Expo/React Native) and `artifacts/mockup-sandbox` (internal
preview tool) are separate codebases with their own component trees, not covered page-by-page here
— see `02-System-Architecture.md` for their role.

## Routing

Routing is handled by `wouter`, configured in `App.tsx`. All routes are defined in a single
`Router()` function using `<Switch>`/`<Route>`. `ProtectedRoute` is a wrapper that uses Clerk's
`<Show when="signed-in">`/`<Show when="signed-out">` components to gate a page, redirecting to `/`
if signed out.

| Path | Component | Protected? |
|---|---|---|
| `/` | `HomeRedirect` → `Home` (signed out) or redirect to `/dashboard` (signed in) | — |
| `/sign-in/*` | `SignInPage` (wraps Clerk's `<SignIn>`) | No |
| `/sign-up/*` | `SignUpPage` (wraps Clerk's `<SignUp>`) | No |
| `/dashboard` | `Dashboard` | Yes |
| `/contacts` | `Contacts` | Yes |
| `/add` | `AddContact` | Yes |
| `/contacts/:id` | `ContactDetail` | Yes |
| `/contacts/:id/edit` | `EditContact` | Yes |
| `/settings` | `Settings` | Yes |
| `/install` | `InstallGuide` | No |
| `/notifications` | `Notifications` | Yes |
| `/feedback` | `Feedback` | Yes |
| `/try` | `DemoDashboard` | No (demo mode, fake data) |
| `/try/contacts/:id` | `DemoContactDetail` | No |
| `/demo` | `LandingPage` | No |
| `/pitch` | `PitchPage` | No |
| (anything else) | `NotFound` | — |

The app supports being served from a non-root base path (`BASE_URL`/`BASE_PATH`, see
`17-Configuration-Reference.md`); `stripBase()` in `App.tsx` strips that prefix so Clerk's own
`routerPush`/`routerReplace` callbacks stay in sync with wouter's `setLocation`.

## Pages (`src/pages/`)

- **`Home.tsx`** — marketing landing page for signed-out visitors: hero copy, "Get started,"
  "Try Demo," "Sign in" CTAs, and a 4-tile feature summary (contacts, smart cadence, live news,
  privacy).
- **`Dashboard.tsx`** — the main authenticated home screen. Computes a "health score"
  (`computeHealthScore` in `lib/utils.ts`) and a Warm/Cooling/Cold breakdown
  (`computeStatus(contact)`, from nextFollowUpDate) across the user's *connected* (non-pipeline) contacts,
  shows an onboarding tour (`OnboardingTour.tsx`) and a dismissible health-score explainer banner
  (state persisted in `localStorage["novara_hs_banner_v1"]`).
- **`Contacts.tsx`** — full contact list with client-side search (name/company/role/`metAt`
  substring match) and two independent filters: connection status (`All`/`Connected`/`Pipeline`)
  and warmth (`All`/`Warm`/`Cooling`/`Cold`/`Dormant`, from `computeStatus(contact)`). All filtering happens against
  the already-fetched `contacts` array — there is no server-side search/filter endpoint.
- **`AddContact.tsx` / `EditContact.tsx`** — contact create/edit forms, including the LinkedIn-URL
  import flow (`BusinessCardScanner.tsx`/`QRScanner.tsx` also live alongside these for alternate
  intake methods).
- **`ContactDetail.tsx`** — single-contact view, including the "mark as contacted" action and
  company news lookup (`useCompanyNews.ts`).
- **`Settings.tsx`** — account info, career statement/goals editor (feeds priority scoring),
  auto-downgrade cadence selector, links to Notification settings, Support (feedback), and Install
  (PWA guide).
- **`InstallGuide.tsx`** — manual "Add to Home Screen" instructions, tabbed by iPhone/Android. See
  `05-Business-Rules.md` rule 7 for the routing caveat around this page.
- **`Notifications.tsx`** — push notification preferences and subscribe/unsubscribe/test actions
  (`useNotifications.ts`, `lib/webNotifications.ts`).
- **`Feedback.tsx`** — the in-app bug report / feature request form. See `04-API.md` and
  `05-Business-Rules.md` rule 8.
- **`SignIn.tsx` / `SignUp.tsx`** — thin wrappers around Clerk's `<SignIn>`/`<SignUp>` components,
  with `forceRedirectUrl` pointed at `/dashboard`.
- **`DemoDashboard.tsx` / `DemoContactDetail.tsx` / `LandingPage.tsx` / `PitchPage.tsx`** —
  unauthenticated demo/marketing surfaces using static fixture data from `src/demo/demoData.ts`,
  not real API calls.
- **`not-found.tsx`** — catch-all 404.

## Components (`src/components/`)

- **`BottomNav.tsx`** — the persistent mobile tab bar (Dashboard/Contacts/Add/Settings), active-tab
  highlighting via wouter's `useLocation()`.
- **`ContactCard.tsx`** — the reusable contact list-item/card used on both Dashboard and Contacts.
- **`ImportanceBadge.tsx` / `StatusBadge.tsx`** — small presentational badges for priority level and
  warm/cooling/cold status.
- **`InstallPrompt.tsx`** — the dismissible install banner; see `05-Business-Rules.md` rule 7.
- **`OnboardingTour.tsx`** — first-run tutorial overlay, gated by `user_settings.has_seen_tutorial`.
- **`BusinessCardScanner.tsx` / `QRScanner.tsx`** — camera-based contact-intake helpers (business
  card OCR / QR code scanning) as alternate paths into `AddContact`.
- **`components/ui/*`** — the shadcn/Radix UI primitive library (accordion, dialog, dropdown, form,
  select, toast, etc.) — standard shadcn generated components, not custom business logic. The same
  set is duplicated in `artifacts/mockup-sandbox/src/components/ui/` for the internal preview tool.

## Hooks (`src/hooks/`)

All server-state hooks follow the same TanStack Query pattern: a `useQuery` for reads (with a
`staleTime` and a `retry` function that gives up immediately on `"Unauthorized"` rather than
retrying a doomed request) plus one `useMutation` per write operation, invalidating the relevant
query key on success.

- **`useContacts.ts`** — contacts list + create/update/delete/mark-contacted/import mutations.
  **Caveat:** as written in this working copy, this hook passes `fetchContacts` and friends
  directly as `queryFn`/`mutationFn`, but those functions require a `getToken` callback as their
  first argument (see `lib/api.ts` below) which TanStack Query does not supply automatically — see
  `15-Known-Issues.md`.
- **`useSettings.ts`** — settings read/write; on a career-profile-affecting update, re-invalidates
  the contacts cache once the settings mutation resolves (the server recalculates synchronously — no timeout)
  (see `05-Business-Rules.md` rule 5).
- **`useFeedback.ts`** — a single mutation wrapping `submitFeedback`, using `getToken` from Clerk's
  `useAuth()` directly (this one *does* correctly thread `getToken` through).
- **`useNotifications.ts`** — notification settings + push subscribe/unsubscribe/test.
- **`useCompanyNews.ts`** — company news lookup for `ContactDetail`.
- **`use-toast.ts` / `use-mobile.tsx`** — generic UI utility hooks (shadcn's toast system, a mobile
  breakpoint media-query hook).

## Client library (`src/lib/`)

- **`api.ts`** — the hand-written fetch client. `apiFetch()` centralizes attaching the Clerk
  Bearer token and JSON headers; throws `"Unauthorized"` if `getToken()` returns nothing.
  Individual functions (`fetchContacts`, `createContact`, `submitFeedback`, etc.) wrap this for
  each endpoint in `04-API.md`.
- **`cadence.ts`** — client-side cadence/maintenance-mode helpers (`isInMaintenanceMode`, used on
  Dashboard).
- **`suggest.ts`** — a thin wrapper over the shared `@workspace/novara-priority` (the single source of truth the backend also uses),
  used for career-goal-tag suggestions in the Settings UI as the user types their career statement.
- **`storage.ts`** — `localStorage` helpers (install-prompt dismissal, health-score banner
  dismissal, and the legacy local-contacts-migration path that `POST /api/contacts/import` exists
  to support).
- **`calendar.ts`** — calendar/date-adjacent helpers.
- **`webNotifications.ts`** — browser Notification API / push-subscription plumbing used by
  `useNotifications.ts` and `Notifications.tsx`.
- **`utils.ts`** — general utilities, including `computeHealthScore`, `computeStatus`,
  `formatDate`, and the shadcn `cn()` className helper.

## PWA / Service Worker

`vite-plugin-pwa` is configured in `vite.config.ts` with `strategies: "injectManifest"`, pointing
at a hand-written service worker (`src/sw.ts`) rather than the plugin's auto-generated one. `sw.ts`
handles precaching (`workbox-precaching`), immediate activation (`skipWaiting()`/`clientsClaim()`),
and Web Push display/click handling — `push` events render a notification via
`self.registration.showNotification()`, and `notificationclick` navigates to the URL embedded in
the push payload's `data.url` (defaulting to `/dashboard`). The PWA manifest (also in
`vite.config.ts`) sets `display: "standalone"`, `start_url: "/install"`, theme color `#2952cc`, and
the standard 192/512/512-maskable icon set.

## Loading and error handling patterns

Consistently across pages: `isLoading` from the relevant `useQuery` gates a spinner
(`Loader2` from `lucide-react`, `animate-spin`), and mutation errors surface via `sonner` toast
notifications (`toast.error(...)`) rather than inline form errors, except for field-level
validation, which uses `react-hook-form` + `zod` resolvers with `<FormMessage>` components (see
`Feedback.tsx` for a complete example of this pattern).

## Navigation patterns

Every authenticated page below the top level renders `<BottomNav />`. Sub-pages reached by drilling
in (e.g. `ContactDetail`, `Feedback`, `InstallGuide`) use a sticky header with a back button
(`wouter`'s `setLocation` to a specific path, or `setLocation(-1)` for "go back") rather than
`BottomNav`.

## Future improvements (explicitly labeled as ideas, not commitments)

Not found anywhere as a stated roadmap — offered here only as natural next steps given the current
gaps documented above and in `15-Known-Issues.md`:

- Fixing the `useContacts.ts` `getToken` threading issue (wrap each call in an arrow function that
  closes over `getToken`, matching the pattern already used correctly in `useFeedback.ts`).
- Extending `lib/api-spec/openapi.yaml` to cover the full API surface, so `lib/api-zod` and
  `lib/api-client-react`'s generated hooks could replace the hand-written `lib/api.ts` client and
  keep frontend/backend contracts in sync automatically.
- Server-side search/filter/pagination for `GET /api/contacts` once a user's contact list grows —
  currently fine at a 25-contact cap, but the all-client-side approach in `Contacts.tsx` won't scale
  past that constraint if it's ever raised.
