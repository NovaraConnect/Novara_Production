# Apple In-App Purchase for Novara Pro: setup and release

Status: **implemented in two pull requests, not merged, not deployed:** the API in
`feat/apple-iap-api` (PR #28) and the web paywall plus native bridge in
`feat/apple-iap-web-native` (PR #29).
The paywall is off by default behind `IAP_PAYWALL_ENABLED`. Nothing here is live
until the manual steps in sections 3 and 4 are done and the release order in
section 6 is followed.

Pricing, copy rules and the pre-launch checklist are in
`docs/BILLING_AND_UNIVERSITY_ACCESS_PLAN.md`, section 4A. This document is the
how-to.

---

## 1. What is built

| Layer | Where | What it does |
|---|---|---|
| Entitlement storage | `artifacts/api-server/migrations/0004_apple_iap_entitlements.sql` | `entitlements` (provider-neutral; Apple rows keyed by Clerk user ID) and `revenuecat_events` (idempotency log) |
| Read model | `api-server/src/lib/entitlements.ts` | `proStatusFor()` and `contactLimitFor()`. Access requires `status = active` **and** `expires_at > now()` at read time |
| Status endpoint | `GET /api/entitlements/me` | The server's Pro answer for the signed-in user |
| Contact limit | `routes/contacts.ts` (POST and import) | Uses `contactLimitFor()`. Free = 6, Pro = unlimited |
| Webhook | `POST /api/webhooks/revenuecat` (`routes/revenuecat.ts`) | The only writer of Apple entitlements. Verified, idempotent, ordered |
| Flag | `GET /api/features` → `applePaywall` | Off unless `IAP_PAYWALL_ENABLED` is set |
| Native module | `ios/App/App/Native/NovaraPurchases.swift` | RevenueCat SDK calls. Reports what Apple says; never decides Pro |
| Bridge | `NovaraBridgeScript.swift` (version **3**), `NovaraRootViewController.swift` | `getProducts`, `identifyPurchases`, `purchase`, `restorePurchases`, `manageSubscriptions` |
| Web | `src/lib/nativeBridge.ts`, `src/lib/purchases.ts`, `src/pages/Paywall.tsx`, `src/hooks/useProStatus.ts`, `src/hooks/useNativePurchaseIdentity.ts` | Native-only paywall at `/pro` (`SUBSCRIPTION_ROUTE`); identity link; limit wall on Add Contact. `usePaywallAvailable()` says whether `/pro` can open; anything linking to it (Settings, Add Contact) checks it first |

**Trust model.** A purchase result from StoreKit is never proof of Pro. After a
purchase the app polls `GET /api/entitlements/me` until the webhook has written
the entitlement. Pro is granted only by a verified webhook event for the
`novara_pro` entitlement, for a Clerk user ID, up to Apple's expiration date.

**Who can see payment controls.**
- A browser never renders the paywall. `canUseNativePurchases()` requires the native shell and bridge version 3.
- A bridge version 1 or 2 build never shows it.
- The server flag must be on.
- University-entitled users never see it (see section 7 for where that check goes).

---

## 2. Identifiers (derived from the verified bundle ID)

Bundle ID, verified in `ios/App/App.xcodeproj/project.pbxproj` and
`capacitor.config.ts`: **`group.novaraconnect.app`**.

| Item | Value | Notes |
|---|---|---|
| Subscription group reference name | `Novara Pro` | Holds both plans, so a customer has one Pro subscription and can switch between plans |
| Monthly product ID | `group.novaraconnect.app.pro.monthly` | **Cannot be changed after creation.** Create exactly this |
| Annual product ID | `group.novaraconnect.app.pro.annual` | As above |
| RevenueCat entitlement identifier | `novara_pro` | Must match `NOVARA_PRO_ENTITLEMENT` (api) and `proEntitlementId` (Swift) |
| RevenueCat offering | `default` (set as current) | Packages: monthly = `$rc_monthly`, annual = `$rc_annual` |

Prices are planned at $4.99 per month and $49.99 per year. Choose the matching
Apple price tiers and confirm them before you enter them. Apple's localized
prices are what the app displays.

---

## 3. Manual steps: App Store Connect

Do these yourself. Nothing in this repository creates them.

1. **Paid Apps Agreement, tax and banking** in App Store Connect → Business. Confirm they are active.
2. **Create the subscription group** `Novara Pro` under the app → Subscriptions.
3. **Create the monthly product** with ID `group.novaraconnect.app.pro.monthly`:
   - Duration 1 month; auto-renewable.
   - Price: the tier for $4.99 (confirm the US tier and the other storefronts you sell in).
   - **No introductory offer and no free trial.**
   - Localized display name and description. These describe unlimited contacts and the Pro feature set. Do not say "free trial" or "lifetime".
4. **Create the annual product** with ID `group.novaraconnect.app.pro.annual`:
   - Duration 1 year; auto-renewable; same group.
   - Price: the tier for $49.99.
   - No introductory offer.
5. **Review metadata for each product:** a review screenshot of the paywall (taken from a TestFlight build), and a review note explaining that Novara Pro unlocks unlimited contacts.
6. **Ranking within the group:** monthly and annual are at the same level (switching between them is up/down-grade). Confirm the ordering you want.
7. **Sandbox testers:** Users and Access → Sandbox → add at least one tester with a unique email that is not a real Apple Account. Use it on the TestFlight device to test purchases without charge.
8. **Subscription disclosures and App Review:** before you submit, check the current App Review Guidelines (section 3.1.2) and Schedule 2 of the Apple Developer Program License Agreement. The paywall copy in `src/lib/purchases.ts` (`AUTO_RENEW_NOTICE`) uses Apple's standard wording and has **not been verified against the live text** here. The paywall links Terms of Use to Apple's standard EULA (`TERMS_OF_USE_URL` in `src/lib/purchases.ts`, `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`) and the Privacy Policy to `/privacy`. Put the same Terms of Use link in App Store Connect (App Information → License Agreement, or in the description). If you publish your own terms, change both.
9. **Submit the products** with the next app version so they are reviewed together with it.

---

## 4. Manual steps: RevenueCat

1. **Create a project** in RevenueCat (one project for Novara).
2. **Add an iOS app** with bundle ID `group.novaraconnect.app`. Connect it to App Store Connect using an App Store Connect API key (RevenueCat's guide walks through creating the key with the In-App Purchase role). Keep that key in RevenueCat only.
3. **Create the entitlement** `novara_pro` and attach both products to it.
4. **Create the products** in RevenueCat using the two App Store product IDs from section 2.
5. **Create the offering** `default`, mark it as **current**, and add two packages: `$rc_monthly` → monthly product, `$rc_annual` → annual product.
6. **Copy the public iOS SDK key** (starts with `appl_`) from Project settings → API keys. This is **public** and is not a secret. Put it in `ios/App/App/Info.plist`, replacing the placeholder value of `RevenueCatPublicSDKKey`. Commit that change in the iOS build, not the secret key.
7. **Create the webhook** in Project settings → Integrations → Webhooks:
   - URL: `https://<your API host>/api/webhooks/revenuecat` (the same host the app calls for `/api`).
   - Authorization header value: the same value you set as `REVENUECAT_WEBHOOK_AUTH` (section 5).
   - Send the production and sandbox events (TestFlight and the sandbox use the sandbox environment).
8. **Send a test event** from the webhook page. The API should answer 200, or 401 if the header is wrong, or 503 if `REVENUECAT_WEBHOOK_AUTH` is not set yet.

Do not put the RevenueCat **secret** API key or the App Store Connect key in
this repository, in Info.plist, or in the app.

---

## 5. Environment variables (names only; values live in the secret store)

| Name | Where | Value | Required before paywall |
|---|---|---|---|
| `REVENUECAT_WEBHOOK_AUTH` | API (Render `novara-prod-api` only) | Random, 32+ bytes (`openssl rand -hex 32`) | **Yes** |
| `IAP_PAYWALL_ENABLED` | API | `true` to show the paywall | Set last, see section 6 |
| `RevenueCatPublicSDKKey` | iOS `Info.plist` (committed) | `appl_…` public key | **Yes** (native builds fail closed without it) |
| Secret RevenueCat / App Store Connect keys | RevenueCat dashboard only | — | Never in the repo |

`.env.example` (API and web) lists the names with empty values.

---

## 6. Release order

Order matters. The API reads the `entitlements` table on every contact
creation, so the migration must exist before the API that uses it is deployed.

1. **Apply migration `0004_apple_iap_entitlements.sql` to production** (hand-applied, in a transaction). The down file is `0004_apple_iap_entitlements.down.sql`. Verified on an empty database: applies, re-applies, and reverses cleanly.
2. **Deploy the API** with `REVENUECAT_WEBHOOK_AUTH` set and `IAP_PAYWALL_ENABLED` **unset**. Contact limits now read the entitlement table. Free users are unchanged.
3. **Configure the RevenueCat webhook** (section 4, step 7) and send the test event.
4. **Build the iOS app** with `RevenueCatPublicSDKKey` set, run `pod install` in `ios/App` (`Podfile.lock` already pins RevenueCat 5.97.0), raise the build number above 10, and upload a TestFlight build.
5. **Sandbox test** on a device with a sandbox tester (section 8).
6. **Turn on the paywall:** set `IAP_PAYWALL_ENABLED=true` on the API. The web build reads it from `/api/features` and shows the paywall only in the native shell.
7. Submit for App Review with the paywall visible.

To turn the paywall off at any time, unset `IAP_PAYWALL_ENABLED`. Existing entitlements remain valid until their expiry.

---

## 7. Rebasing the university branch (`feat/university-access`)

That branch was built before this one and also defines an `entitlements` table in
its own `0004_entitlements_and_organizations.sql`. Two migrations cannot both
create it. Do this when rebasing:

1. **Renumber** its migration to `0005_…` and make its entitlement statements an **ALTER** of this table, not a `CREATE TABLE`. Add its columns and constraints on top:
   - `ALTER TABLE entitlements ADD COLUMN organization_id uuid NULL REFERENCES organizations(id) ON DELETE CASCADE;`
   - Create the partial unique index `(user_id, organization_id) WHERE source = 'university'`.
   - The `source` CHECK here already allows `university`, so it needs no change.
   - Add its organization constraint with `ALTER TABLE entitlements ADD CONSTRAINT … CHECK (source <> 'university' OR organization_id IS NOT NULL)`.
2. **Merge the contact-limit logic.** `contactLimitFor()` must return `Infinity` when *either* the Apple entitlement *or* the university entitlement is active. The university branch's `universityEntitlementFor()` should be called from `proStatusFor()`'s sibling, not replace it.
3. **Paywall visibility.** Replace the `universityEntitled: false` placeholder in `src/pages/Paywall.tsx` and `src/pages/AddContact.tsx` with the university entitlement state from that branch's `/api/entitlements` data. University users must never see the paywall or a price.
4. **Test schema.** Update `tests/schema.sql` and the truncate list in `tests/setup.ts` to match the renumbered migration, then run both suites.

---

## 8. Sandbox test script

On a TestFlight build with a sandbox tester signed in to the device's App Store:

1. Sign in to Novara. Open Add Contact with 6 contacts, then "See Novara Pro". The paywall opens.
2. Plans load with Apple's localized prices. Annual is preselected.
3. Subscribe to monthly. Confirm. The app shows "Confirming…" then "Novara Pro is active." Add a 7th contact.
4. In RevenueCat, confirm the subscriber and the `novara_pro` entitlement. In the API database, `entitlements` has an `apple_iap` row with a future `expires_at`.
5. Cancel the purchase in the sandbox (Settings → Apple Account → Subscriptions). Expiry is shortened in sandbox. When it expires, the webhook marks the row inactive and the 7th contact is refused again.
6. Restore Purchases on a fresh install with the same Apple Account: Pro returns.
7. Manage Subscription opens Apple's subscription page.
8. In a browser, `/pro` redirects to Settings and no Apple control appears.
9. With `IAP_PAYWALL_ENABLED` unset, `/pro` redirects to Settings on the device as well.

---

## 9. Known gaps and risks

- **`TRANSFER` moves access.** If someone restores purchases while signed in to a different Novara account with the same Apple Account, RevenueCat transfers the subscription (its default restore behaviour) and the webhook moves Pro to the new Novara account and switches the old one off. Keep RevenueCat's restore behaviour on "Transfer to new App User ID".
- **Refunds end access immediately.** RevenueCat reports an Apple refund as `CANCELLATION` with `cancel_reason = CUSTOMER_SUPPORT`; the webhook switches Pro off at once.
- **Deploying the API before the migration** no longer breaks contact creation: the server logs an error and treats everyone as Free until `0004` is applied.
- **Account deletion does not cancel Apple's subscription.** Only the user can cancel in their Apple settings. Deleting the account removes Novara's data, and the paywall copy should tell users to cancel first. This should be added to the account-deletion flow text before launch.
- **Ask to Buy and pending purchases** report "pending". Pro starts when Apple approves and the webhook arrives.
- **Runtime verification.** The app compiles with RevenueCat 5.97.0 on Xcode 27 and launches on an iOS 27 simulator to the sign-in page. A real purchase still has to be exercised on a TestFlight build with a sandbox tester before release.
- **Shared native files with PR #32.** `AppDelegate.swift`, `SceneDelegate.swift`, the Info.plist scene manifest and the version/build/team lines in `project.pbxproj` are byte-identical to PR #32 (`feat/add-contact-import-layout`), so the two merge cleanly in either order. Links and Universal Links are forwarded to Capacitor from `SceneDelegate`, not `AppDelegate`.
- **Apple guideline text.** The paywall copy and the disclosures in section 3, step 8 must be checked against the live guidelines before submission.
- **Feature list.** The paywall lists only what Pro does today: unlimited contacts and unlimited imports. Add to it when the Pro feature list is written down (`BILLING_AND_UNIVERSITY_ACCESS_PLAN.md`, section 4A.5).
- **Account deletion text.** Settings' delete-account dialog does not yet tell subscribers to cancel in their Apple Account first. Add that line when Settings is redesigned.
- **Savings label.** "Save 16%" is fixed text derived from the planned prices. Update it if prices change.

---

## 10. Verification performed on this branch

- API: 211 tests pass against a real Postgres 16 (a dedicated `novara_iap_test` database), including webhook authentication, idempotency, out-of-order events, anonymous and foreign-entitlement rejection, expiry, refunds, transfers, Pro import, account deletion, and a missing `entitlements` table.
- Migration: applied, re-applied, and reversed on an empty database.
- Web: `npm run typecheck` clean; 202 tests pass (15 of them new: the subscription route, the paywall rules, the post-purchase wait, and the purchase bridge gating); the production web build succeeds.
- Native: `pod install`, an Xcode 27 simulator build, and a launch on an iOS 27 simulator (reaches the sign-in page) succeed.
- Not yet verified: a live RevenueCat sandbox purchase and a live webhook delivery.
