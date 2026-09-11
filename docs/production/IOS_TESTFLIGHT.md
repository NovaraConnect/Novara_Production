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
| `artifacts/project-novara/ios/` | The generated native Xcode project |
| `artifacts/project-novara/package.json` | `@capacitor/{cli,core,ios}` pinned at 7.4.4 |

**Why Capacitor is a repo dependency.** An earlier version of this document told
you to run the CLI on demand with `pnpm dlx @capacitor/cli@7.4.4`, to keep the
packages out of the production web install. That does not work: `cap add ios`
resolves the native platform from the project's own `node_modules/@capacitor/ios`
and fails with *"Could not find the ios platform"* when the CLI is running from a
temporary dlx store. `cap sync` has the same requirement. The packages are
therefore pinned as devDependencies.

Consequence to be aware of: `novara-prod-web` runs `pnpm install
--frozen-lockfile` on every deploy, so these three packages are installed on
every production web build. None of their code enters the browser bundle — it
costs install time, not bundle size.

**Invoke the CLI through the local binary**, not `pnpm exec` / `pnpm run`:

```bash
./node_modules/.bin/cap <command>
```

pnpm's wrappers run a dependency-status check that re-runs `pnpm install`, which
trips this repo's `ERR_PNPM_IGNORED_BUILDS` gate (the same gate the Render build
commands work around with `pnpm approve-builds --all`). The binary directly does
not.

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

## Step 2 — Build the web app and sync the native project

Requires **Xcode** (with command line tools) and **CocoaPods**. `ios/` is
already generated and committed, so on a fresh clone you sync rather than add.

```bash
# from the repo root
pnpm install --frozen-lockfile
cd artifacts/project-novara

# build the web app first — cap sync copies from dist/public
PORT=5173 BASE_PATH=/ \
VITE_API_BASE_URL=https://api.novaraconnect.group \
VITE_CLERK_PUBLISHABLE_KEY=<the pk_live key already used by novara-prod-web> \
  ./node_modules/.bin/vite build --config vite.config.ts

# CocoaPods lives in Homebrew's prefix, which a non-login shell may not have
export PATH="/opt/homebrew/bin:$PATH"
export LANG=en_US.UTF-8

./node_modules/.bin/cap sync ios     # copies web assets + runs pod install
./node_modules/.bin/cap open ios     # opens ios/App/App.xcworkspace
```

If `cap sync` reports *"Skipping pod install because CocoaPods is not
installed"*, the `PATH` line above is missing — `pod` is at
`/opt/homebrew/bin/pod`. You can also run it directly:

```bash
cd ios/App && pod install
```

Only if you ever need to regenerate the project from scratch:

```bash
./node_modules/.bin/cap add ios
```

Always open the **`.xcworkspace`**, never the `.xcodeproj` — CocoaPods requires
it.

`VITE_*` values are baked in at build time. They are the same non-secret values
`novara-prod-web` already uses — the Clerk **publishable** key is public by
design and is already embedded in the deployed web bundle, so it can be read
back out of it if needed.

In `remote` mode these built assets are **not** what users see: the shell loads
the live site. The build still has to run because `cap sync` copies from
`dist/public`. The values matter when you switch to `bundled`.

## Step 3 — Native settings

These are **already set in the repo**, so there is nothing to click for them.
They are file settings rather than Xcode-session settings, which means they are
reviewable in a diff and they survive a `cap sync`:

| Setting | Value | Where |
|---|---|---|
| Bundle identifier | `group.novaraconnect.app` | `PRODUCT_BUNDLE_IDENTIFIER` |
| Display name | Novara | `CFBundleDisplayName` |
| Version / build | 1.0.0 / 1 | `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` |
| Deployment target | iOS 14.0 (Capacitor 7's floor) | `IPHONEOS_DEPLOYMENT_TARGET` |
| Orientation | portrait only, matching the PWA manifest | `UISupportedInterfaceOrientations` |
| Device family | iPhone only | `TARGETED_DEVICE_FAMILY` |
| Signing style | Automatic | `CODE_SIGN_STYLE` |
| Camera permission | `NSCameraUsageDescription` | `Info.plist` |
| Photo library permission | `NSPhotoLibraryUsageDescription` | `Info.plist` |

Both usage strings are required — iOS terminates the app on first camera or
photo-library access if they are missing. Their wording is accurate about what
happens: OCR runs on-device, and only the extracted text is ever sent to the
backend.

### The one thing Xcode has to do

**Signing team.** Select the target → Signing & Capabilities → check *Automatically
manage signing* → pick your team. `DEVELOPMENT_TEAM` is deliberately not
committed: it is account-specific, and Xcode writes it on first selection.

### iPhone only

`TARGETED_DEVICE_FAMILY` is `"1"`. The Capacitor template ships `"1,2"`
(iPhone + iPad); iPad was dropped deliberately. Consequences, so nobody
"restores" it by accident:

- No iPad App Store screenshots to produce, and no iPad reviewer judging a
  layout the PWA was never designed for.
- The app does not appear in iPad search results and cannot be installed on
  iPad. Reverting to `"1,2"` later is a one-line change, but adds the
  screenshot set back.
- `UISupportedInterfaceOrientations~ipad` was removed from `Info.plist` for the
  same reason — with no iPad target it was dead configuration.

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
- **After merge:** revert it. The production-visible part is `pnpm-lock.yaml`:
  three extra packages get installed on each `novara-prod-web` build, and none
  of them enter the bundle, so the built output is unchanged. Reverting restores
  the previous lockfile. Merging also triggers a `novara-prod-web` deploy
  (Auto-Deploy fires on any push to `main`), producing the same site as before.
- The shell has no effect on the running web app in either mode. Pulling a
  TestFlight build does not touch production.
- If a released iOS build misbehaves in `remote` mode, the web fix deploys
  through Render as usual and reaches the app immediately — no resubmission.
