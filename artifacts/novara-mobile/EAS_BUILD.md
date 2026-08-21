# Novara iOS — EAS Build / TestFlight / App Store

Local build/submit config for the Expo app. **Nothing here has been run** — no EAS
cloud builds, no Apple submissions. This documents what is already configured and
exactly what you must fill in before building.

## What is already configured (committed)
- `app.config.js`
  - `name: "Novara"`, `slug: "novara"`, `scheme: "novara"`, `version: "1.0.0"`
  - `ios.bundleIdentifier: "com.novaraconnect.novara"`, `ios.buildNumber: "1"`
  - `android.package: "com.novaraconnect.novara"` (hygiene; iOS is the current target)
  - iOS `infoPlist` permission strings for camera, photo library, calendar, location
  - `ITSAppUsesNonExemptEncryption: false` (auto-answers export compliance)
- `eas.json` with `development`, `preview`, `production` build profiles + a `production` submit profile
- Icon: `assets/images/icon.png` is 1024×1024, no alpha — App Store-ready
- `package.json` scripts: `eas:build:ios:preview`, `eas:build:ios:production`, `eas:submit:ios`, `prebuild:ios`

## Placeholders YOU must fill before submitting
| Where | Key | What to put | How to get it |
|---|---|---|---|
| `eas.json` → submit.production.ios | `appleId` | your Apple ID email | your Apple Developer login |
| `eas.json` → submit.production.ios | `ascAppId` | App Store Connect app ID (numeric) | App Store Connect → your app → App Information → "Apple ID" |
| `eas.json` → submit.production.ios | `appleTeamId` | 10-char Team ID | developer.apple.com → Membership |
| `app.config.js` → extra.eas | `projectId` | EAS project UUID | written automatically by `eas init` |
| `eas.json` build env (preview/production) | `EXPO_PUBLIC_API_BASE_URL` | real production API origin | set once the prod backend/domain exists (e.g. `https://api.novaraconnect.group`, or the Render `*.onrender.com` URL initially) |

## Prerequisites (your actions — cannot be automated here)
1. Apple Developer Program membership (active).
2. `npm i -g eas-cli` and `eas login` (Expo account).
3. From this folder: `eas init` (creates the EAS project, writes `extra.eas.projectId`).

## Build & submit (run locally when the above is ready — DO NOT run in CI blindly)
```bash
cd artifacts/novara-mobile
# 1. First real device build (internal testers):
pnpm run eas:build:ios:preview
# 2. Production build for TestFlight/App Store:
pnpm run eas:build:ios:production
# 3. Upload the latest build to App Store Connect / TestFlight:
pnpm run eas:submit:ios
```
EAS provisions iOS signing credentials and the APNs key interactively on first run.

## ⚠️ Pre-submission blocker (must resolve first)
The current Expo app does **not** implement Clerk authentication. `lib/api.ts` calls
the backend with **no `Authorization` header**, and contacts are kept in local
device storage (`lib/storage.ts`), not the authenticated backend. Two consequences:
1. The hardened backend gates `/api/linkedin/import` and `/api/company-news` behind
   `requireAuth`, so those mobile features will get **401** until the app signs in.
2. App Review needs a working, signed-in app + a demo account. A no-auth local-only
   build with broken backend features is likely to be rejected.

**Decision needed before submission:** either (a) add Clerk auth (`@clerk/clerk-expo`)
to the mobile app so it matches the web app and sends a bearer token, or (b) ship a
deliberately scoped local-only app and remove/guard the backend-dependent features.
This is an architecture decision, intentionally left to you — the config above is
ready either way.

## Assets checklist (before store listing)
- [x] App icon 1024×1024 (no alpha) — present
- [x] Splash screen — configured (`#f7f5f0`)
- [ ] Screenshots (6.7" / 6.5" / 5.5") — generate from the real build
- [ ] Privacy policy URL — required (app stores personal contact data)
- [ ] App Store description, keywords, subtitle, support URL
- [ ] Demo account for App Review (working sign-in + seeded contacts)

See also `docs/production/TESTFLIGHT_APPSTORE.md` at the repo root.
