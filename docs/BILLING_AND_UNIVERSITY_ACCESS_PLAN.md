# Novara billing and university access: implementation plan

Status: **PLAN ONLY. No code, schema, Render, or provider changes have been made.**
Owner decisions are listed in section 9 and must be answered before implementation starts.

### Decisions (recorded 2026-10-21)

1. **Apple IAP implementation target is the Capacitor shell** (`artifacts/project-novara/ios`). The Expo path (`artifacts/novara-mobile`) is out of scope unless App Store Connect later shows the Expo build is the one in review.
2. **`entitlements` is a new, additive, provider-neutral table.** It is not a rename of, and does not depend on, the Stripe-only `subscriptions` table from the `feat/stripe` branch.
3. **University organizations come first:** organizations, administrator roles, invitations, acceptance, revocation, and expiry. Students are unlimited; there are no seats. Detail is in `docs/UNIVERSITY_ACCESS_IMPLEMENTATION_PLAN.md`.
4. **University entitlement works in the iOS app and in the Android web/PWA after sign-in.** It never shows a payment screen to a student.
5. **No consumer Stripe Checkout in this release.** Stripe web work stays on `feat/stripe`. Any future Stripe work starts with the native-shell gate as its first commit.
6. **Apple subscription state is authoritative.** Access follows the state that Apple/RevenueCat reports. No extra grace period is added on top of it.

Baseline: `main` at `d3f1344` (includes the onboarding fix merged from `codex/fix-onboarding-loop`, commit `dc9ec69`).

---

## 1. Verified facts this plan depends on

These were checked directly, not assumed.

**Production runtime (Render, read-only audit):**
- `novara-prod-api`: Node web service, `api.novaraconnect.group`, repo `NovaraConnect/Novara_Production`, branch `main`. **Auto-deploy is off.** Health check `/api/healthz`. Build command contains `|| true` and `pnpm approve-builds --all`; start command is `pnpm --filter @workspace/api-server run start`.
- `novara-prod-web`: static site, the browser SPA built from `artifacts/project-novara`. **Auto-deploys on every commit to `main`.** Publish directory `artifacts/project-novara/dist/public`.
- `novara-test-api`: suspended. Not audited further.
- Live commit for both services at time of audit: `90660c3`. Merge of the onboarding fix (`d3f1344`) has since auto-deployed to `novara-prod-web` only.

**Production environment variable names (names only, no values):**
- API: `ANTHROPIC_API_KEY`, `APNS_BUNDLE_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY_B64`, `APNS_TEAM_ID`, `CARD_AI_PARSE`, `CARD_AI_PROVIDER`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`, `FEEDBACK_TO_EMAIL`, `FRONTEND_URL`, `GNEWS_API_KEY`, `LINKEDIN_AI_PARSE`, `LINKEDIN_AI_PROVIDER`, `LINKEDIN_SCREENSHOT_IMPORT`, `LOG_LEVEL`, `NODE_ENV`, `VAPID_SUBJECT`. The page had a "Show more" link that was not expanded, so the list may be incomplete.
- **No `STRIPE_*` and no `REVENUECAT_*` variables exist in production.** Billing is not configured anywhere.
- Frontend: `BASE_PATH`, `PORT`, `SKIP_INSTALL_DEPS`, `VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`.
- Push is disabled: `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are absent (confirmed by a warning log).

**Auth and data:**
- Identity is Clerk. The API resolves `userId` from Clerk on each request (`requireAuth`).
- Per-user settings live in Postgres table `user_settings`, including `has_seen_tutorial`. Schema is managed by hand-applied SQL migrations (see `artifacts/api-server/migrations/`, plus `0003` referenced in the news cache notes).
- Contact limits are enforced in the live code. Commit `90660c3` set the free-tier ceiling to **6 contacts** as a single module-level constant, applied to both create paths and to `POST /contacts/import`. Existing contacts above the ceiling are kept and cannot be added to.

**Clients:**
- The shipped iOS app is the web app (`artifacts/project-novara`) inside a native shell (Capacitor/TestFlight build 8, per comments in `Welcome.tsx` and `docs/production`). The shell hides the native tab bar on routes outside its four sections.
- `artifacts/novara-mobile` is a separate Expo SDK 54 app with Clerk and its own settings, no billing, and no onboarding. Its status as a shipped client is **unverified** and must be confirmed (see section 9, question 1).

**Existing Stripe work:**
- Branch `feat/stripe` at commit `ed18a1b`: `feat(billing): Novara Pro via Stripe, inert until configured`. Parent is `90660c3`. **Not deployed.** Whether it exists on GitHub is **unverified** (the local clone on the Mac has it; this session's clone does not).
- The commit's file list and contents have **not yet been reviewed in this plan**. Section 5 lists the review.
- Its `project-novara` hooks `useBilling.ts` and `useFeatures.ts` were modified by that commit (file timestamps differ from the rest of the tree).

**Constraints already agreed:**
- Individual launch pricing is **decided** (2026-10-27) in section 4A: one plan, Novara Pro, $4.99/month or $49.99/year, each with a 7-day free trial, no contact limit. Pending App Store review. The earlier six-contact Free plan and the $7.99–9.99 range are superseded.
- Stripe is the web payment rail only. Apple In-App Purchase is required for any digital subscription purchased inside the iOS app.
- Universities pay an annual campus license by invoice or purchase order, Net 30, as organizations. Students never self-assign access from a `.edu` address. University access has no per-student cap.

---

## 2. Goals and non-goals

**Goals**
1. One server-authoritative entitlement check for `novara_pro`, used by every premium gate on the API.
2. iOS consumers can buy Novara Pro with Apple In-App Purchase through RevenueCat, with restore and manage-subscription paths.
3. Web consumers can buy Novara Pro through Stripe Checkout, using the existing `feat/stripe` work where it holds up under review.
4. Universities buy an annual campus license that covers unlimited students. An administrator invites named students, and each invitation is verified.
5. Access changes (purchase, renewal, expiry, cancellation, member revocation) take effect without deleting any contacts, settings, or profile data.

**Non-goals (for this project)**
- SSO for universities (later).
- Rebuilding onboarding or the dashboard.
- Changing the contact model.
- Any consumer-facing route to Pro that bypasses Apple IAP inside the iOS app.

---

## 3. Entitlement model (shared, server-side)

### 3.1 Tables (proposed; not yet created)

`entitlements` is provider-neutral and additive. It is created by migration `0004_entitlements_and_organizations.sql` on `main`. The Stripe branch's `subscriptions` table stays a separate Stripe projection. If that branch later adds its own `0004`, it is renumbered to `0005` when rebased. Exact SQL is in `docs/UNIVERSITY_ACCESS_IMPLEMENTATION_PLAN.md`.

| Table | Purpose | Key columns |
|---|---|---|
| `entitlements` | One row per grant of `novara_pro` to a user | `id`, `user_id` (Clerk id), `entitlement_key` (`novara_pro`), `source` (`apple_iap` \| `stripe_web` \| `university_contract`), `status` (`active` \| `grace` \| `expired` \| `revoked`), `starts_at`, `ends_at`, `provider_ref`, `organization_id` (nullable), `created_at`, `updated_at` |
| `billing_events` | Idempotency log for provider webhooks | `provider` (`revenuecat` \| `stripe`), `event_id` (unique with provider), `received_at`, `processed_at`, `payload_hash`, `outcome` |
| `organizations` | A university or business account | `id`, `name`, `status` (`active` \| `suspended` \| `ended`), `contract_starts_at`, `contract_ends_at`, `licensed_enrollment` (nullable; commercial metadata only, never read by an access check), `stripe_customer_id` (nullable; unused for university invoices), `created_at` |
| `organization_members` | A member, admin, or invitation | `id`, `organization_id`, `user_id` (nullable until accepted), `email` (lowercased), `role` (`admin` \| `member`), `invitation_status` (`pending` \| `accepted` \| `revoked` \| `expired`), `invited_by`, `invited_at`, `expires_at`, `accepted_at`, `revoked_at` |

Constraints to include:
- Unique `(provider, event_id)` on `billing_events`.
- At most one `active` `novara_pro` entitlement per user for each source. Overlaps resolve to the best source (section 3.3).
- No head-count limit. Universities have unlimited students, so no database check or transaction caps membership. `licensed_enrollment` is commercial metadata for renewal and reporting, and no access check reads it.

### 3.2 Access check (single entry point)

- One module, for example `artifacts/api-server/src/lib/entitlements.ts`, exposing `hasEntitlement(userId, 'novara_pro')` and `getEntitlementSummary(userId)`.
- Every premium check calls this module. Current hard-coded limits (the 6-contact constant) move behind it.
- Client code never decides access. The client calls `GET /api/entitlements/me` for display only, and the server re-checks on every gated write.

### 3.3 Precedence and state rules

- If a user has several active grants, the effective state is `active` if any grant is `active`, otherwise `grace` if any is in grace, otherwise free.
- `university_contract` grants are created only by an organization admin's accepted invitation. They end when the member is revoked or the contract ends.
- Expiry or revocation downgrades to free. It never deletes contacts, `user_settings`, or profile data. Users above the 6-contact ceiling keep their data and cannot add more.
- Grace period: **none added for Apple.** Access follows the state Apple/RevenueCat reports (decision 6, 2026-10-21). The earlier 7-day proposal is withdrawn for Apple purchases.

### 3.4 Migration path

- Existing users have no `entitlements` rows and resolve to free. This matches current behaviour, so no backfill is needed.
- Migration is additive: create new tables only. No change to `user_settings`, `contacts`, or existing columns.
- Apply by hand, the way migrations are applied now, after the code is ready to read the tables but before any gate depends on them (see section 7, phase 1).

---

## 4. iOS: Apple In-App Purchase via RevenueCat

### 4.1 Client placement (blocking decision)

The shipped iOS app is a web view shell. StoreKit needs a native bridge, so the paywall has to live in one of two places:

- **Option A (preferred):** add a native purchase bridge to the existing iOS shell (RevenueCat SDK, `Purchases.configure`, product fetch, purchase, restore), and expose a paywall route in the web app that calls the bridge when running inside the shell. Browser visitors see no iOS purchase UI.
- **Option B:** build the paywall in `artifacts/novara-mobile` (Expo) and make that the iOS app. This is a larger change and conflicts with the current shipped build unless the web app is retired on iOS.

**Decided: Option A (Capacitor shell).** The Expo path is out of scope unless App Store Connect shows otherwise.

### 4.2 Products and placement

- One subscription group, `novara_pro`, with two products: **monthly** and **annual**. Product identifiers are placeholders and will be confirmed in App Store Connect.
- Products are configurable per environment (sandbox vs production) through environment variable names only (section 8).
- Paywall shows: what Pro includes, the price, the billing period, and renewal behaviour, in plain language, before purchase. Also shows restore purchases and a manage-subscription link to Apple's subscription page.
- No Stripe Checkout, card form, or web purchase link appears in the iOS paywall.

### 4.3 Server integration

- RevenueCat webhook to `POST /api/webhooks/revenuecat`, authenticated with a shared secret header. Reject any request that fails the check.
- Each webhook is written to `billing_events` first, keyed by the provider's event id. Duplicate events return success without reprocessing.
- The webhook updates `entitlements` for `source = 'apple_iap'`, using the RevenueCat app user id mapped to the Clerk user id. The mapping is set when the app logs in to RevenueCat with the Clerk id.
- Server verification: the server does not trust the client's purchase result. The client sends the RevenueCat customer info only as a hint, and the server confirms through the RevenueCat REST API or the webhook before granting access.

### 4.4 Required behaviour

- Loading, error, and retry states for product fetch and purchase.
- Restore purchases works on a fresh install with the same Apple ID.
- Access follows Apple/RevenueCat's authoritative subscription state. No additional grace period is added on top of what that state reports.
- Expired or cancelled subscriptions downgrade access when the provider reports them inactive.
- Account deletion is out of scope here, but the entitlement must not be left active for a deleted Clerk user (flagged for later).

---

## 4A. Individual launch pricing and Apple IAP setup

> **Status: decided by the owner on 2026-10-27:** "Go with one Pro plan: 7-day free trial, then $4.99/month or $49.99/year, no contact limits." Implemented in PRs #28 and #29 (see `docs/APPLE_IAP_SETUP.md`), pending App Store review. No Apple product exists yet. Prices must be confirmed against Apple's price tiers before they are entered.

### 4A.1 Plans

| Plan | Price | Contacts | Notes |
|---|---|---|---|
| Novara Pro Monthly | 7 days free, then $4.99 per month | Unlimited | Complete Pro feature set. Auto-renewing. |
| Novara Pro Annual | 7 days free, then $49.99 per year | Unlimited | Complete Pro feature set. Auto-renewing. |

- **No lifetime plan** at launch.
- **7-day free trial** on both plans, as an Apple introductory offer. Apple allows one per subscription group per Apple Account.
- **No free plan once a subscription is required.** Without Pro or the trial, a user keeps every contact and can view, edit, delete and follow them up, but cannot add or import new ones. Until the `IAP_SUBSCRIPTION_REQUIRED` switch is turned on (after the new app version is live), Free keeps the 6-contact limit.
- **University-entitled users** remain unlimited and never see individual payment offers, upgrade prompts, or Pro pricing. This applies whether the entitlement comes from an invitation or (future) SSO.
- **Web (Stripe):** no consumer web price is set. Consumer web checkout is out of this release (section 5).

### 4A.2 Derived figures (for copy checks)

- Annual price per month: $49.99 ÷ 12 = $4.17 (rounded to the cent).
- Annual saving versus twelve monthly payments: $59.88 − $49.99 = $9.89, which is 16.5% of $59.88. If displayed, round down and say "Save 16%", and use that figure in every place it appears.

### 4A.3 Required Apple IAP product IDs (proposed names)

| Item | Proposed value | Notes |
|---|---|---|
| Subscription group reference name | Novara Pro | Both plans in one group, so a customer can only hold one, and can upgrade or downgrade within it (guideline 3.1.2(b)). |
| Subscription group ID | assigned by App Store Connect | Record it. |
| Monthly product ID | `group.novaraconnect.app.pro.monthly` | **Confirm the bundle prefix against the iOS bundle identifier in Xcode before creating anything.** Product IDs cannot be changed after creation. |
| Annual product ID | `group.novaraconnect.app.pro.annual` | Same confirmation. |
| Monthly price | $4.99 (US tier, to confirm) | Confirm the matching Apple tier exists for each storefront. Use Apple's localized prices in the app. |
| Annual price | $49.99 (US tier, to confirm) | As above. |
| Subscription period | 1 month; 1 year | Both at least seven days (guideline 3.1.2(a)). |
| Introductory offer / free trial | Free, 1 week, on both products | Decision above. |

Environment variable names (section 8) carry these IDs: `REVENUECAT_PRODUCT_MONTHLY_ID`, `REVENUECAT_PRODUCT_ANNUAL_ID`. Values live in the secret store, not in git, and are read from the environment rather than hard-coded.

### 4A.4 Price display and copy requirements

1. **Use Apple's localized price** from StoreKit for every display. Never hard-code a number in the paywall. The figures above are for the plan document only.
2. **Show the billing period** next to the price: "$4.99 per month" and "$49.99 per year".
3. **Show renewal terms** in plain language before purchase: the plan renews automatically unless cancelled at least 24 hours before the end of the current period (confirm the exact cancellation wording against Apple's current requirements), and how to manage the subscription.
4. **Describe what the customer gets** before asking them to subscribe (guideline 3.1.2(c)): unlimited contacts and the complete Pro feature set, listed.
5. **Savings copy** on annual only, using the single figure in 4A.2.
6. **Trial wording must be true for the person reading it.** The paywall shows "7 days free, then $X per period" and "Start 7-day free trial" only when Apple confirms the Apple Account can still get the trial; otherwise it shows plain prices. It also says how to avoid being charged (cancel at least 24 hours before the trial ends).
7. **No lifetime wording**.
8. **Restore purchases** is visible on the paywall (guideline 3.1.1 requires a restore mechanism for restorable purchases).
9. **Manage subscription** link goes to Apple's subscription page.
10. **Same copy on the App Store listing** and in the app. Mismatches are a common rejection reason.
11. **University users** see no paywall, no price, and no upgrade prompt.

### 4A.5 Pre-launch checklist (for the Apple IAP build)

Account and setup
- [ ] Confirm the iOS bundle identifier and the product ID prefix. Record both.
- [ ] Paid Apps Agreement and banking reconfirmed in App Store Connect.
- [ ] Subscription group "Novara Pro" created; both products added with the IDs in 4A.3.
- [ ] Price tiers chosen for $4.99 and $49.99, and confirmed available in the storefronts the app will sell in.
- [ ] Introductory offer configured on both products: Free, 1 week, all storefronts.
- [ ] No lifetime or non-subscription SKU created for Pro.

Metadata and review
- [ ] Localized display name and description for each product, describing unlimited contacts and the Pro feature set.
- [ ] Review screenshot of the paywall for each product.
- [ ] Subscription disclosures (title, length, price, auto-renewal, privacy policy, terms of use) checked against the current App Review Guidelines and Schedule 2 of the Apple Developer Program License Agreement at submission time. Not verified here; the checklist does not assume the exact list.
- [ ] Privacy policy URL and terms of use URL are live and linked in the app and in App Store Connect.
- [ ] Feature list for "complete Pro feature set" written down and approved. It is not in this plan.

App behaviour
- [ ] Paywall shows localized prices, billing period, renewal terms, and the Pro description before purchase.
- [ ] Restore purchases works on a fresh install with the same Apple ID.
- [ ] Manage subscription opens Apple's subscription page.
- [ ] Upgrade and downgrade between monthly and annual works inside the group, with no duplicate subscription (guideline 3.1.2(b)).
- [ ] Expired or cancelled state removes Pro access only when Apple/RevenueCat report it inactive (no added grace).
- [ ] Individual paywall hidden for university-entitled users, and for any user who already has an active entitlement from another source.
- [ ] Copy review: no trial, lifetime, or pricing text that the app does not deliver.
- [ ] Account deletion path available in the app, if Apple's current rules still require it at submission. Tracked as an open risk in section 12.

Testing
- [ ] Sandbox: trial start, trial conversion, cancellation during the trial, purchase, renewal, cancellation, expiry, restore, upgrade, downgrade, and no second trial for the same Apple Account.
- [ ] Server: webhook or REST verification grants and removes `apple_iap` entitlements, with duplicate-event handling.
- [ ] Legal review of subscription copy (decision 7 in section 9).

Not in this checklist: RevenueCat configuration. It waits for the owner's approval, as do all external settings.

---

## 5. Web: Stripe (existing `feat/stripe` work)

**Not in this release.** No consumer Stripe Checkout ships with the current launch scope. The `feat/stripe` branch stays unmerged. If Stripe web billing is chosen later, the native-shell gate (hide Stripe upgrade and portal controls inside the Capacitor shell) must be the first commit on that branch, before any Stripe configuration or merge.

### 5.1 Review checklist for `ed18a1b` (must complete before reuse)

Read the diff and answer each item:
- Does it create Checkout Sessions only on the server, with `STRIPE_SECRET_KEY` never sent to the client?
- Does the success redirect only navigate, with access granted solely by the webhook?
- Is every webhook verified with `stripe.webhooks.constructEvent` against the raw body and the webhook secret?
- Is webhook processing idempotent through `billing_events`?
- Does it write to the shared `entitlements` table, or to its own tables? (Must be the shared table.)
- Are the price IDs read from environment variables, not hard-coded?
- Is the customer id linked to the Clerk user id, and is a user's Checkout tied to that user (not to a client-supplied id)?
- Does it touch `useBilling.ts` / `useFeatures.ts` in a way that changes free-tier behaviour?

Output of this review: keep / modify / discard for each file in the commit. Nothing is merged from `feat/stripe` until this review is done.

### 5.2 Web purchase flow (target)

1. Signed-in user opens the upgrade page on the web app.
2. Client calls `POST /api/billing/stripe/checkout` with the desired plan.
3. Server creates a Checkout Session for that Clerk user and returns the URL.
4. Stripe webhook `checkout.session.completed` and subscription events update `entitlements` (`source = 'stripe_web'`).
5. The success page refreshes entitlement state from the server. It does not grant access by itself.

### 5.3 Customer portal

- Subscription management uses the Stripe customer portal, opened from a server-created session.

### 5.4 Apple compliance

- The iOS app must not present the web checkout as a way to buy Novara Pro. Any external purchase link in iOS requires a current Apple entitlement and legal review. Treat it as **out of scope** until counsel confirms the current rules (section 9).

---

## 6. University organizations and commercial model

### 6.1 Commercial model

- A university buys an annual campus license as an organization. Payment is by annual invoice or purchase order, Net 30, outside the app.
- Access is **unlimited for students**. Any invited student can join. No head-count cap, seat count, or per-student fee applies.
- `licensed_enrollment` records the enrolled population the contract was priced on. It is used for renewal and reporting conversations only. It is never an access-control limit, and no request is rejected or revoked because of it.
- The contract sets `contract_starts_at` and `contract_ends_at` (optional end date).
- Pricing tiers and the founding-partner offer are in section 6.4.

### 6.2 Roles and flows

- **Administrator** (`role = admin`): invites students, revokes invitations and members, and sees only their organization's member list and invitation status. Created by Novara staff, not self-service.
- **Member** (`role = member`): receives an invitation and accepts it. Sees only their own entitlement.
- **Invitation flow:** admin creates an invitation with an email. The token is single use, expires after 14 days, and is stored only as a hash. Accepting requires signing in with a verified email that matches the invited address. Acceptance creates a `university_contract` entitlement.
- **Roster import** (CSV of emails) is a later phase, planned in `docs/UNIVERSITY_ACCESS_IMPLEMENTATION_PLAN.md` section 15. Each row is still an invitation, not an automatic grant.
- **Revocation** removes one member, sets that entitlement to `revoked`, and leaves all user data in place.
- **Reassignment** revokes one member and invites a new person.

### 6.3 Rules

- A `.edu` address alone grants nothing. Access requires an accepted invitation.
- Students see only their own entitlement and cannot see billing, the admin list, or other students.
- Admins see masked member emails, invitation status, and their organization's member count, for their organization only.
- Only platform staff see `licensed_enrollment`.

### 6.4 Pricing and terms (proposed, owner to confirm)

| License | Eligible enrollment band | Annual price |
| --- | ---: | ---: |
| Founding pilot | One department / up to 500 students | $5,000–$7,500 |
| Department | Up to 2,000 students | $10,000–$15,000 |
| Campus | Up to 10,000 students | $20,000–$30,000 |
| Large campus or system | More than 10,000 students | Custom, starting around $35,000 |

- **Founding-partner offer (first one or two universities):** $10,000 per year for campus-wide access for up to 10,000 enrolled students. The rate is locked for two years.
- **Terms:** annual invoice or purchase order, Net 30.
- **SSO add-on (future):** offered only for campus-wide or enterprise contracts. It has its own setup fee and annual add-on price, unless the contract is at a higher tier that includes it. Neither amount is set. Do not promise SSO to a university until the Clerk price is recorded (`docs/UNIVERSITY_SSO_ACCESS_PLAN.md` section 9.6).
- **Not in scope:** consumer Stripe Checkout, any in-app university payment, and any payment screen shown to a student. Universities pay outside the app. Students only accept an invitation.
- Price bands are for contract conversations. The app does not show them and does not enforce them.

### 6.5 Expiry handling

- A scheduled job (existing `scheduler.ts` pattern) marks organizations `ended` after `contract_ends_at`, sets their entitlements to `expired`, and does not delete data.
- Invitations past `expires_at` are marked `expired` and cannot be accepted.

---

## 7. Phased delivery

**Order decided (2026-10-21): university access first.** It needs no payment UI and no native build. See `docs/UNIVERSITY_ACCESS_IMPLEMENTATION_PLAN.md`. The phases below are kept for the Apple IAP work that follows.

Each phase ships behind a feature flag, defaulting to off in production.

**Phase 0: decisions and verification (no code)**
- Answer section 9.
- Review `ed18a1b` file by file (section 5.1).
- Confirm which iOS client is shipped (section 9, question 1).

**Phase 1: entitlement foundation (server only)**
- Add the new tables by hand-applied migration. Additive only.
- Add `lib/entitlements.ts` and `GET /api/entitlements/me`.
- Move the 6-contact limit behind `hasEntitlement`. Behaviour for free users stays identical.
- Tests: free user unchanged; Pro user unlocked; revoked user falls back to free; contacts never deleted.

**Phase 2: Apple IAP via RevenueCat (sandbox)**
- Native bridge and paywall in the shell (Option A).
- Webhook endpoint with signature check and idempotency.
- Tests in sandbox only.

**Phase 3: Stripe web (test mode)**
- Apply the review outcome to `feat/stripe`. Keep only what passes review.
- Checkout endpoint, webhook, customer portal.
- Tests with Stripe test keys and test price IDs.

**Phase 4: universities**
- Organization and invitation endpoints, admin-only UI.
- Expiry job.
- Pilot with one organization.

**Phase 5: production launch**
- Production keys and products, after App Review.
- Turn flags on gradually. Monitor webhook failures and entitlement mismatches.

---

## 8. Configuration (names only; no values in this repository)

Add to the API service in Render, only after approval. Values go in Render's secret store, never in git.

- `REVENUECAT_WEBHOOK_SECRET` (secret)
- `REVENUECAT_API_KEY` (secret)
- `REVENUECAT_PRODUCT_MONTHLY_ID`, `REVENUECAT_PRODUCT_ANNUAL_ID`
- `STRIPE_SECRET_KEY` (secret)
- `STRIPE_WEBHOOK_SECRET` (secret)
- `STRIPE_PRICE_MONTHLY_ID`, `STRIPE_PRICE_ANNUAL_ID`
- `NOVARA_PRO_ENABLED` (feature flag, default off)
- `BILLING_GRACE_DAYS` (default 7). Not used for Apple purchases. Relevant only to Stripe, if that work is resumed.
- Frontend (build-time, non-secret): `VITE_RC_PUBLIC_KEY`, `VITE_NOVARA_PRO_ENABLED`

Note: `VITE_*` values are public in the browser bundle. Only publishable keys belong there.

---

## 9. Decisions needed before implementation

Answered 2026-10-21: Q1 (Capacitor), Q4 (no consumer Stripe in this release), Q5 (no extra grace period beyond Apple/RevenueCat state). The remaining questions stay open.

1. **Which iOS client is shipped?** The web-in-shell app (`project-novara`) or the Expo app (`novara-mobile`)? This determines Option A vs B.
2. **Prices:** decided in section 4A ($4.99 per month; $49.99 per year; 7-day free trial; no lifetime). Pending App Store review.
3. **Pro contents:** Pro is the only plan; adding and importing contacts need it once a subscription is required. A longer feature list is still to be written down (section 4A.5).
4. **Launch scope:** iOS only first, or iOS and web together?
5. **Grace period:** withdrawn for Apple purchases. Apple/RevenueCat state is authoritative (decision 6). Any future Stripe grace period is decided with the Stripe work.
6. **University pricing:** resolved in section 6.4 (annual campus license, tiered by enrollment band, unlimited students, invoice Net 30). Still open: who creates organizations (recommended: platform staff) and whether to confirm the band prices with counsel.
7. **Legal review:** Apple external purchase rules for web links, and university contract terms (counsel).
8. **Apple guideline status:** confirm current App Review rules before the paywall copy is written.

---

## 10. Verification and rollback

**Tests**
- Entitlement module unit tests for every state transition in section 3.3.
- Webhook tests: bad signature rejected, duplicate event ignored, out-of-order events resolved by timestamp.
- Unlimited access tests: many invited students can join regardless of `licensed_enrollment`, and lowering that figure changes no access.
- Single-use tests: concurrent accepts of one invitation admit exactly one account.
- Regression: existing contact limit and import behaviour unchanged for free users.
- Manual: sandbox purchase, restore, cancel, and expiry on iOS; Stripe test-mode checkout and portal.

**App Review notes (draft, to finalize later)**
- Novara Pro subscriptions are sold only through Apple In-App Purchase inside the iOS app.
- University access is a separate organization contract paid off-app by the institution. Students receive access through an invitation from their institution's administrator. This is not a consumer purchase route.

**Rollback**
- Set `NOVARA_PRO_ENABLED` to off. Gates revert to free behaviour immediately.
- Existing entitlement rows are left in place and are read-only while the flag is off.
- Schema changes are additive, so rollback needs no database revert.
- Code rollback uses a normal revert commit, since `main` auto-deploys the frontend.

---

## 11. Manual setup remaining (not started)

- **App Store Connect:** subscription group, two products, pricing, localized descriptions, review screenshots. Paid Apps Agreement and bank were reported Active in September; reconfirm.
- **RevenueCat:** project, iOS app, products mapped to entitlement `novara_pro`, webhook URL and secret, sandbox and production keys.
- **Apple server notifications:** configure if RevenueCat is not the sole source.
- **Stripe:** account verification, test and live products and prices, webhook endpoint, customer portal configuration, Stripe Invoicing setup for universities.
- **Render:** add the variable names in section 8 to `novara-prod-api` only. Do not change `novara-prod-web` env or auto-deploy settings for this project.
- **Database:** apply the additive migration by hand after review.

---

## 12. Open risks

- The iOS app is a web-in-shell build. A native StoreKit bridge is a shell change, which requires a new native build and TestFlight review.
- `novara-prod-api` auto-deploy is off, so the API must be deployed by hand after each merge.
- Build command on Render contains `|| true` and `pnpm approve-builds --all`. Install failures can be hidden, and the approval step rewrites `pnpm-workspace.yaml` during builds. Fix this before the billing work relies on a clean build.
- `render.yaml` describes legacy services and must not be used for deployment.
- Push notifications are disabled because VAPID keys are missing. Unrelated to billing, but noted.
- News provider returned HTTP 429 during the audit. Unrelated to billing.
