# TestFlight / App Store Plan

## Framework decision: keep Expo (do NOT switch)
`artifacts/novara-mobile` is already Expo + expo-router with `newArchEnabled: true`.
The lowest-friction path to TestFlight is **Expo Application Services (EAS) Build**.
- ❌ Don't switch to Capacitor (would wrap the web app — thin-webview App Review risk) or bare React Native (full rewrite). No upside for this app.
- ✅ Expo Managed + EAS Build → native `.ipa` → TestFlight → App Store.

## Current gaps in `app.config.js` (must fix before a build)
- ✅ has: `name: "Project Novara"`, `slug: "novara-mobile"`, `version: "1.0.0"`, icon, splash, `newArchEnabled`.
- ❌ missing: `ios.bundleIdentifier`, `ios.buildNumber`.
- ❌ missing: `eas.json` (no build profiles), no linked EAS project (`extra.eas.projectId`).
- ❌ `EXPO_PUBLIC_API_BASE_URL` currently defaults to localhost/Replit — must point at `https://api.novaraconnect.group` for release builds.
- ⚠️ `expo-notifications` push requires an **APNs key** from the Apple Developer account.

## One-time Apple setup  ⚠️ NEEDS APPROVAL / YOUR ACTION (I can't do these)
1. **Apple Developer Program** enrollment ($99/yr). Individual or Organization (Org needs a D-U-N-S number; pick early — it affects the seller name).
2. Choose a **bundle ID**, e.g. `group.novaraconnect.novara` (reverse-DNS, immutable once shipped).
3. Create the App in **App Store Connect** (name "Novara", primary language, category e.g. Productivity).
4. Create an **APNs key** (for push) and register it with Expo/EAS credentials.

## Build & submit steps (I can scaffold configs; you run the account-linked commands)
```bash
npm i -g eas-cli
eas login
cd artifacts/novara-mobile
eas build:configure                 # creates eas.json (I can pre-write this)
# set ios.bundleIdentifier in app.config.js and EXPO_PUBLIC_API_BASE_URL
eas build --platform ios --profile production
eas submit --platform ios --latest  # uploads the .ipa to App Store Connect / TestFlight
```

## App Store Connect content checklist
- [ ] App icon (1024×1024, no alpha) — source in `artifacts/novara-mobile/assets/images/`.
- [ ] Splash screen — already configured (`#f7f5f0` background).
- [ ] Screenshots — 6.7", 6.5", and 5.5" iPhone sizes (use `screenshots/` as a starting basis; regenerate from the real app).
- [ ] App description, keywords, subtitle, support URL, marketing URL.
- [ ] **Privacy policy URL** (required) — host at e.g. `https://novaraconnect.group/privacy`. Novara stores personal contact data, so this is mandatory.
- [ ] **App Privacy "data collection" questionnaire** — declare: contacts data (user-entered), account (Clerk), analytics (PostHog). Be accurate.
- [ ] **Demo account** for App Review — a working Clerk prod login with seeded sample contacts, entered in the "App Review Information" notes. Reviewers reject apps they can't fully exercise.
- [ ] Age rating, export-compliance (uses standard HTTPS encryption).

## TestFlight rollout
1. First `eas submit` build appears in TestFlight after Apple processing.
2. Add **internal testers** (your Apple team) — no review needed.
3. For MBA pilot users as **external testers**, a light "Beta App Review" is required; provide the demo account + notes.
4. Iterate builds (bump `ios.buildNumber`) until stable, then submit for full App Store review.

## App Review risk notes (things that get Novara rejected)
- Backend slow/broken during review → keep prod backend on a warm paid tier.
- Missing/inaccurate privacy policy or data questionnaire.
- Reviewer can't sign in → the demo account must actually work.
- Anything that reads as a thin web wrapper → ship the real native Expo build, not a webview.
