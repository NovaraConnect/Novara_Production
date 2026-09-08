# iOS shell → TestFlight

Novara's **production web app is the source of truth**. The iOS app is a
Capacitor shell around it: no product logic lives in the native project, and
nothing here changes what the web app does.

This document covers what is in the repo, what has to happen on a Mac with
Xcode, and what has to happen in accounts only Cloe controls.

---

## What is in the repo

| Path | Purpose |
|---|---|
| `artifacts/project-novara/capacitor.config.ts` | Shell config, incl. the remote/bundled mode switch |
| `artifacts/project-novara/package.json` | `@capacitor/{cli,core,ios}` devDeps + `ios:*` scripts |
| `.gitignore` | Excludes iOS build output and per-developer Xcode state |

**Not in the repo yet:** the generated `ios/` native project. It is created by
`cap add ios`, which needs Xcode and CocoaPods — see step 2.

The Capacitor packages are **devDependencies**. They are installed during the
`novara-prod-web` build (Render runs a workspace-wide `pnpm install`) but none
of their code enters the browser bundle.

---

## The two modes, and why it matters

`NOVARA_IOS_MODE` decides how the shell gets the app, and it has consequences
well beyond the native project.

### `remote` (default)

The shell loads `https://app.novaraconnect.group` directly.

- Web releases reach the app as soon as Render deploys them. No rebuild, no
  resubmission.
- The page origin stays `app.novaraconnect.group`, so **Clerk and the API see
  exactly what they see in a browser today. No production configuration
  changes at all.**
- Requires a network connection to open the app.
- **App Review risk:** guideline 4.2 (Minimum Functionality). A shell that only
  loads a website is a common rejection. Fine for TestFlight and internal
  testing; not a safe assumption for public release.

### `bundled`

Built assets ship inside the binary, served from `capacitor://localhost`.

- Stronger review posture, and the app shell opens offline.
- Every web change needs a rebuild and a new TestFlight/App Store submission.
- **Blocker to resolve first:** the page origin becomes `capacitor://localhost`,
  which the Clerk **production** instance must accept, or sign-in fails. A
  production Clerk instance does not take `localhost` through the Domains page;
  it needs the native/allowed-origins path. Settle this before switching, and
  verify sign-in on a device before submitting.
- The API is unaffected — `app.ts` uses `cors({ origin: true })`, which already
  accepts any origin.

Recommended sequence: **ship `remote` to TestFlight first** to validate the
build, signing, and the real device experience. Move to `bundled` before public
release, once the Clerk origin question is answered.

---

## Step 1 — Apple account setup (Cloe only)

1. **Apple Developer Program** membership, active ($99/yr).
2. **Bundle ID** — register `group.novaraconnect.app` (matches `appId` in
   `capacitor.config.ts`; change both together if you want a different one).
3. **App Store Connect record** — new iOS app, name "Novara", primary language,
   the bundle ID from above.
4. **Signing** — Xcode's automatic signing is sufficient; it will create the
   development and distribution certificates on first build.

## Step 2 — Generate the native project (Mac with Xcode)

Requires **Xcode** (with command line tools) and **CocoaPods**. Neither is
installed on the machine used to write this, which is why `ios/` is not
committed yet.

```bash
# from the repo root
pnpm install
cd artifacts/project-novara

# build the web app first — cap add/sync copies from dist/public
PORT=5173 BASE_PATH=/ \
VITE_API_BASE_URL=https://api.novaraconnect.group \
VITE_CLERK_PUBLISHABLE_KEY=<the pk_live key already used by novara-prod-web> \
  pnpm run build

pnpm run ios:add     # generates ios/ — commit this directory
pnpm run ios:sync    # copies web assets + native config into ios/
pnpm run ios:open    # opens Xcode
```

`VITE_*` values are baked in at build time. They are the same non-secret values
`novara-prod-web` already uses — the Clerk **publishable** key is public by
design and is already embedded in the deployed web bundle.

## Step 3 — Native settings in Xcode

Set once, then commit the changed `ios/` files.

- **Display name:** Novara. **Version:** 1.0.0. **Build:** 1.
- **Deployment target:** iOS 14 or later (Capacitor 7's floor).
- **Device orientation:** portrait only, matching the PWA manifest.
- **Signing:** your team, automatic.
- **`Info.plist` usage strings** — required, and the app will crash on first
  use without them:
  - `NSCameraUsageDescription` — "Novara uses the camera to scan business cards
    so contact details can be filled in for you."
  - `NSPhotoLibraryUsageDescription` — "Novara reads a screenshot you choose so
    it can pre-fill contact details. Images stay on your device."

Both are accurate: OCR runs on-device, and only the extracted text is ever sent
to the backend.

## Step 4 — TestFlight

1. Xcode → **Product → Archive** → **Distribute App** → **App Store Connect**.
2. In App Store Connect → TestFlight, complete the **export compliance**
   questions (the app uses only standard HTTPS).
3. Add yourself as an internal tester; internal builds need no review.
4. Install via TestFlight and run the smoke test below.

## Step 5 — On-device smoke test

- Sign in with Clerk (the highest-risk step — see the mode notes).
- Add a contact manually; confirm it persists after force-quitting.
- **Business card scan** — camera permission prompt appears, OCR runs, fields
  prefill.
- **LinkedIn screenshot import** — photo permission prompt appears, fields
  prefill, and the accuracy reminder is visible.
- Confirm no horizontal scrolling and that the bottom nav clears the home
  indicator.

---

## Before public release (not needed for TestFlight)

- Privacy policy URL, reachable and public.
- App Privacy questionnaire: contacts data, and the fact that OCR text is sent
  to an AI provider for parsing.
- Screenshots for required device sizes; App Store description.
- Decide `remote` vs `bundled` — see the guideline 4.2 note above.

## Rollback

Nothing here is deployed, so rollback is repo-only:

- **Before merge:** close the PR.
- **After merge:** revert it. The only production-visible artifact is
  `pnpm-lock.yaml`; reverting restores the previous lockfile and the next
  `novara-prod-web` deploy builds exactly as it does today.
- The shell has no effect on the running web app in either mode. Pulling a
  TestFlight build does not touch production.
- If a released iOS build misbehaves in `remote` mode, the web fix deploys
  through Render as usual and reaches the app immediately — no resubmission.
