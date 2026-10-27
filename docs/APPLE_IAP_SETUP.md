# Apple In-App Purchase for Novara Pro: setup and release

Status: **implemented in two pull requests, not merged, not deployed:** the API in
`feat/apple-iap-api` (PR #28) and the web paywall plus native bridge in
`feat/apple-iap-web-native` (PR #29).
The paywall is off by default behind `IAP_PAYWALL_ENABLED`. Nothing here is live
until the manual steps in sections 3 and 4 are done and the release order in
section 6 is followed.

**Pricing (decided 2026-10-27):** one plan, Novara Pro, at $4.99 per month or
$49.99 per year. Each has a **7-day free trial** (an Apple introductory offer).
There is no contact limit for subscribers. Once `IAP_SUBSCRIPTION_REQUIRED` is
on, adding or importing contacts needs Pro or the trial. Someone who never
subscribes, or whose trial or subscription ends, keeps every contact and can
still view, edit, delete and follow up with them. They just can't add new ones.
Until that switch is on, Free keeps today's 6-contact limit.

Pricing, copy rules and the pre-launch checklist are in
`docs/BILLING_AND_UNIVERSITY_ACCESS_PLAN.md`, section 4A. This document is the
how-to.

---

## 1. What is built

| Layer | Where | What it does |
|---|---|---|
| Entitlement storage | `artifacts/api-server/migrations/0004_apple_iap_entitlements.sql` | `entitlements` (provider-neutral; Apple rows keyed by Clerk user ID) and `revenuecat_events` (idempotency log) |
| Trial marker | `migrations/0007_entitlements_period_type.sql` | Adds `entitlements.period_type` (RevenueCat's TRIAL / NORMAL …), so a trial can be shown as one. Numbered 0007 because `feat/visual-refresh` uses 0005 and 0006 |
| Read model | `api-server/src/lib/entitlements.ts` | `proStatusFor()` and `contactLimitFor()`. Access requires `status = active` **and** `expires_at > now()` at read time. A trial is access |
| Status endpoint | `GET /api/entitlements/me` | `pro`, `expiresAt`, `state` (`trial` / `active` / `expired` / `none`) and `billingPeriod` (`monthly` / `annual`) |
| Who can add contacts | `routes/contacts.ts` (POST and import) | Uses `contactLimitFor()`. Pro or trial = unlimited. Otherwise 0 once a subscription is required (403 `SUBSCRIPTION_REQUIRED`), or 6 before that (403 `CONTACT_LIMIT_REACHED`) |
| Webhook | `POST /api/webhooks/revenuecat` (`routes/revenuecat.ts`) | The only writer of Apple entitlements. Verified, idempotent, ordered |
| Flags | `GET /api/features` → `applePaywall`, `subscriptionRequired` | `applePaywall` follows `IAP_PAYWALL_ENABLED`. `subscriptionRequired` follows `IAP_SUBSCRIPTION_REQUIRED` and is only ever on together with the paywall |
| Native module | `ios/App/App/Native/NovaraPurchases.swift` | RevenueCat SDK calls. Reports what Apple says, including `trialDays` per plan (0 unless Apple confirms this Apple Account can still get the trial); never decides Pro |
| Bridge | `NovaraBridgeScript.swift` (version **3**), `NovaraRootViewController.swift` | `getProducts`, `identifyPurchases`, `purchase`, `restorePurchases`, `manageSubscriptions` |
| Web | `src/lib/nativeBridge.ts`, `src/lib/purchases.ts`, `src/pages/Paywall.tsx`, `src/hooks/useProStatus.ts`, `src/hooks/useSubscriptionState.ts`, `src/hooks/useAddContactAccess.ts`, `src/hooks/useNativePurchaseIdentity.ts` | Native-only paywall at `/pro` (`SUBSCRIPTION_ROUTE`); identity link; the wall on Add Contact. `usePaywallAvailable()` says whether `/pro` can open; anything linking to it (Settings, Add Contact) checks it first. `useSubscriptionState()` gives the plan and a label ("Free trial · 5 days left", "Novara Pro · Annual", …) for the Settings row |

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

Prices are $4.99 per month and $49.99 per year, each with a 7-day free trial.
Choose the matching Apple price tiers and confirm them before you enter them.
Apple's localized prices, and Apple's trial length, are what the app displays.

---

## 3. Manual steps: App Store Connect

Do these yourself. Nothing in this repository creates them.

1. **Paid Apps Agreement, tax and banking** in App Store Connect → Business. Confirm they are active.
2. **Create the subscription group** `Novara Pro` under the app → Subscriptions.
3. **Create the monthly product** with ID `group.novaraconnect.app.pro.monthly`:
   - Duration 1 month; auto-renewable.
   - Price: the tier for $4.99 (confirm the US tier and the other storefronts you sell in).
   - **Introductory offer:** Subscription Prices → Introductory Offers → add one. Type **Free**, duration **1 week**, all countries, no end date.
   - Localized display name and description. These describe unlimited contacts and the Pro feature set. Do not say "lifetime".
4. **Create the annual product** with ID `group.novaraconnect.app.pro.annual`:
   - Duration 1 year; auto-renewable; same group.
   - Price: the tier for $49.99.
   - The same introductory offer: Free, 1 week, all countries.
   - Apple gives one introductory offer per subscription group per Apple Account, so someone can't take the trial twice by switching plans. The app asks Apple and only shows "7 days free" to accounts that can still get it.
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
| `IAP_PAYWALL_ENABLED` | API | `true` to show the paywall | Set after the TestFlight test, see section 6 |
| `IAP_SUBSCRIPTION_REQUIRED` | API | `true` to make Pro or the trial the only way to add contacts | Set once the new app version is **live on the App Store**, see section 6 |
| `RevenueCatPublicSDKKey` | iOS `Info.plist` (committed) | `appl_…` public key | **Yes** (native builds fail closed without it) |
| Secret RevenueCat / App Store Connect keys | RevenueCat dashboard only | — | Never in the repo |

`.env.example` (API and web) lists the names with empty values.

---

## 6. Release order

Order matters. The API reads the `entitlements` table on every contact
creation, so the migration must exist before the API that uses it is deployed.

1. **Apply migrations `0004_apple_iap_entitlements.sql` and `0007_entitlements_period_type.sql` to production** (hand-applied, each in a transaction, 0004 first). The down files reverse them (0007 first). Verified on an empty database: both apply, re-apply, and reverse cleanly. `feat/visual-refresh`'s 0005 and 0006 touch other tables and can go before or after.
2. **Deploy the API** with `REVENUECAT_WEBHOOK_AUTH` set and both `IAP_PAYWALL_ENABLED` and `IAP_SUBSCRIPTION_REQUIRED` **unset**. Free users are unchanged (6 contacts).
3. **Configure the RevenueCat webhook** (section 4, step 7) and send the test event.
4. **Build the iOS app** with `RevenueCatPublicSDKKey` set, run `pod install` in `ios/App` (`Podfile.lock` already pins RevenueCat 5.97.0), raise the build number above 10, and upload a TestFlight build.
5. **Sandbox test** on a device with a sandbox tester (section 8).
6. **Turn on the paywall:** set `IAP_PAYWALL_ENABLED=true` on the API. Safe before Apple approves the new version: only bridge-3 builds can show it, and nothing changes for anyone else.
7. **Submit for App Review** with both subscriptions attached. The reviewer reaches the paywall from Add Contact on a demo account that already has 6 contacts.
8. **After the new version is live on the App Store:** set `IAP_SUBSCRIPTION_REQUIRED=true`. From then on, adding or importing contacts needs Pro or the trial. People on an older app version are told to update; people in a browser are told to subscribe in the iPhone app.

To switch everything off at once, unset `IAP_PAYWALL_ENABLED`; that also lifts the subscription requirement, and Free goes back to 6 contacts. Unsetting only `IAP_SUBSCRIPTION_REQUIRED` keeps the paywall and goes back to the 6-contact Free plan. Existing entitlements remain valid until their expiry either way.

Why step 8 waits: if a subscription were required before the new app is on the App Store, nobody could add contacts and nobody could subscribe. If you would rather Apple review the final experience, you can turn it on at submission instead, accepting that during review nobody on the current app can add contacts.

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
2. Plans load with Apple's localized prices and "7 days free, then …". Annual is preselected. The button says "Start 7-day free trial".
3. Choose monthly and start the trial. The app shows "Confirming…" then "Your 7-day free trial has started." Add a 7th contact. `GET /api/entitlements/me` reports `state: "trial"`.
4. In RevenueCat, confirm the subscriber and the `novara_pro` entitlement. In the API database, `entitlements` has an `apple_iap` row with `period_type = 'TRIAL'` and a future `expires_at`.
5. Sandbox time runs fast (a 1-week trial lasts a few minutes). Let it convert: the webhook's RENEWAL turns `state` into `active`. Then cancel (Settings → Apple Account → Subscriptions). When it expires, `state` is `expired` and a new contact is refused; existing contacts can still be opened and edited.
6. Open the paywall again with the same sandbox account: no trial is offered any more, only prices.
7. Restore Purchases on a fresh install with the same Apple Account (while subscribed): Pro returns.
8. Manage Subscription opens Apple's subscription page.
9. In a browser, `/pro` redirects to Settings and no Apple control appears.
10. With `IAP_PAYWALL_ENABLED` unset, `/pro` redirects to Settings on the device as well.
11. On a test API with `IAP_SUBSCRIPTION_REQUIRED=true` as well: a new account with no subscription sees "Add contacts with Novara Pro" on Add Contact.

---

## 9. Known gaps and risks

- **`TRANSFER` moves access.** If someone restores purchases while signed in to a different Novara account with the same Apple Account, RevenueCat transfers the subscription (its default restore behaviour) and the webhook moves Pro to the new Novara account and switches the old one off. Keep RevenueCat's restore behaviour on "Transfer to new App User ID".
- **Refunds end access immediately.** RevenueCat reports an Apple refund as `CANCELLATION` with `cancel_reason = CUSTOMER_SUPPORT`; the webhook switches Pro off at once.
- **Deploying the API before the migrations** does not break contact creation: the server logs an error and treats everyone as not subscribed until `0004` and `0007` are applied. With the switches off, that means Free.
- **The subscription requirement is a hard paywall.** Once it is on, a brand-new account cannot add its first contact without starting the trial, and people who only use Novara in a browser cannot subscribe there. Consider telling current users before you switch it on.
- **Account deletion does not cancel Apple's subscription.** Only the user can cancel in their Apple settings. Deleting the account removes Novara's data, and the paywall copy should tell users to cancel first. This should be added to the account-deletion flow text before launch.
- **Ask to Buy and pending purchases** report "pending". Pro starts when Apple approves and the webhook arrives.
- **Runtime verification.** The app compiles with RevenueCat 5.97.0 on Xcode 27 and launches on an iOS 27 simulator to the sign-in page. A real purchase still has to be exercised on a TestFlight build with a sandbox tester before release.
- **Shared native files with PR #32.** `AppDelegate.swift`, `SceneDelegate.swift`, the Info.plist scene manifest and the version/build/team lines in `project.pbxproj` are byte-identical to PR #32 (`feat/add-contact-import-layout`), so the two merge cleanly in either order. Links and Universal Links are forwarded to Capacitor from `SceneDelegate`, not `AppDelegate`.
- **Apple guideline text.** The paywall copy and the disclosures in section 3, step 8 must be checked against the live guidelines before submission.
- **Feature list.** The paywall lists only what Pro does today: unlimited contacts and unlimited imports. Add to it when the Pro feature list is written down (`BILLING_AND_UNIVERSITY_ACCESS_PLAN.md`, section 4A.5).
- **Account deletion text.** Settings' delete-account dialog does not yet tell subscribers to cancel in their Apple Account first. Add that line when Settings is redesigned.
- **Savings label.** "Save 16%" is fixed text derived from the planned prices. Update it if prices change.
- **Trial wording.** "New subscribers can try it free for 7 days" on Add Contact is fixed text. The paywall itself uses Apple's trial length and only promises the trial to Apple Accounts that can still get it. Change the Add Contact text if the trial length changes.

---

## 10. Verification performed on this branch

- API: 220 tests pass against a real Postgres 16 (a dedicated `novara_iap_test` database), including webhook authentication, idempotency, out-of-order events, anonymous and foreign-entitlement rejection, expiry, refunds, transfers, Pro import, account deletion, a missing `entitlements` table, and the trial: trial state, conversion to annual, lapse (contacts kept and editable, adding refused), the requirement switch and its dependence on the paywall switch, and a missing `period_type` column.
- Migrations: 0004 and 0007 applied, re-applied, and reversed on an empty database.
- Web: `npm run typecheck` clean; 208 tests pass (the subscription route, the paywall rules, the Add Contact rules with and without a subscription requirement, plan labels and trial days, the post-purchase wait, the status parser, and the purchase bridge gating); the production web build succeeds.
- Native: `pod install`, an Xcode 27 simulator build (including the trial-eligibility change), and a launch on an iOS 27 simulator (reaches the sign-in page) succeed.
- Not yet verified: a live RevenueCat sandbox purchase and a live webhook delivery.
