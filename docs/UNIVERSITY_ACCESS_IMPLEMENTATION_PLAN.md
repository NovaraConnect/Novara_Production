# University Access: Implementation Plan

Status (2026-10-21): **approved for implementation; NOT released.** Built on branch `feat/university-access` from `main`, behind disabled-by-default flags. No merge, deploy, production migration, Render environment change, or `RESEND_API_KEY` addition has happened. Release needs a separate explicit approval (section 14).

Companion document: `docs/BILLING_AND_UNIVERSITY_ACCESS_PLAN.md` (decisions recorded 2026-10-21).

## 0. Scope and decisions this plan implements

- University access ships first. Apple IAP and any Stripe work come later.
- Target: Capacitor iOS shell (`artifacts/project-novara/ios`) plus the web app. Expo (`artifacts/novara-mobile`) is out of scope.
- A student gets access after signing in with an invitation. No payment screen is ever shown to a student.
- Access is stored in a new, additive, provider-neutral `entitlements` table.
- No consumer Stripe Checkout in this release.
- Access is read-time authoritative: a request checks membership, organization status, and access end date directly, so no scheduled job is needed for correctness.

Out of scope for this release: SSO/SAML, domain auto-join, bulk CSV import, per-seat billing, Apple IAP, RevenueCat, Stripe.

## 1. Verified facts this plan relies on (main @ d3f1344)

- Migrations live in `artifacts/api-server/migrations/`, applied by hand. Main has `0001`, `0002`, `0003`. `0004_subscriptions.sql` exists only on `feat/stripe`.
- Routes mount in `artifacts/api-server/src/routes/index.ts`. Auth is `requireAuth` in `src/middlewares/auth.ts`, which sets `req.userId` (Clerk user ID, text).
- `src/lib/email.ts` sends through Resend. The client is lazy and needs `RESEND_API_KEY`. That key is **not** in the production environment today. `RESEND_FROM_EMAIL` defaults to `onboarding@resend.dev`, which only delivers to the Resend account owner.
- `src/lib/scheduler.ts` runs node-cron at 09:00 UTC. Used only for the optional expiry sweep (section 7).
- `src/routes/contacts.ts` on main hardcodes `FREE_TIER_LIMIT = 6` (around lines 19, 102, 497). The university entitlement must lift this limit through a shared helper.
- The native shell routes any path outside the four tab sections to a full-screen web view with no tab bar (`NovaraRouter.target(forPath:)`). A new `/invite` route therefore needs **no binary change**, the same way `/welcome` works.
- `render.yaml` is legacy. Deploy only through the Render dashboard, using `novara-prod-api` (auto-deploy OFF) and `novara-prod-web` (auto-deploy ON from `main`).

## 2. Feature flags and configuration

| Name | Where | Default | Purpose |
|---|---|---|---|
| `UNIVERSITY_ACCESS_ENABLED` | api-server env | unset (off) | When off, all `/api/organizations*`, `/api/invitations*`, and `/api/entitlements*` routes return 404. |
| `PLATFORM_ADMIN_USER_IDS` | api-server env | unset (none) | Comma-separated Clerk user IDs allowed to create organizations and set seat limits. |
| `VITE_UNIVERSITY_ACCESS` | web build env | unset | Shows the invite route and the Settings "Organization" section. Also surfaced through `/api/features` as `universityAccess`. |
| `INVITE_BASE_URL` | api-server env | `https://app.novaraconnect.group` | Base for invitation links. |
| `RESEND_API_KEY` | api-server env | unset | **Needs owner approval to add to `novara-prod-api`.** Without it, invitation email is skipped and the admin copies the link (section 6). |
| `RESEND_FROM_EMAIL` | api-server env | `onboarding@resend.dev` | Set to an address on the verified `novaraconnect.group` domain before real invitations go out. The sandbox sender only reaches the Resend account owner. |

Rules:

- Both flags default off, so merging the code changes nothing for users.
- The server flag is the real gate. The web flag only hides UI.
- Turning the server flag off is the emergency rollback. It needs no migration rollback and no deploy if the env change is applied through the Render dashboard with a restart.

## 3. Database migration

### 3.1 `artifacts/api-server/migrations/0004_entitlements_and_organizations.sql`

Additive only. It creates four tables and touches no existing table.

```sql
-- 0004_entitlements_and_organizations.sql
-- Additive. Does not alter existing tables.
-- User IDs are Clerk user IDs (text), matching existing tables.
-- Verify column type against user_settings before applying.

BEGIN;

CREATE TABLE IF NOT EXISTS organizations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'suspended')),
  seat_limit            integer NOT NULL DEFAULT 0 CHECK (seat_limit >= 0),
  access_ends_at        timestamptz NULL,
  created_by_user_id    text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id               text NOT NULL,
  role                  text NOT NULL CHECK (role IN ('admin', 'member')),
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'revoked')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  revoked_at            timestamptz NULL,
  CONSTRAINT organization_members_one_row UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_members_user_idx
  ON organization_members (user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS organization_invitations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email                 text NOT NULL CHECK (email = lower(email)),
  role                  text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  token_hash            text NOT NULL UNIQUE,            -- SHA-256 of the token; the raw token is never stored
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at            timestamptz NOT NULL,
  invited_by_user_id    text NOT NULL,
  accepted_by_user_id   text NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  accepted_at           timestamptz NULL
);
CREATE INDEX IF NOT EXISTS organization_invitations_org_idx
  ON organization_invitations (organization_id, status);

CREATE TABLE IF NOT EXISTS entitlements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               text NOT NULL,
  source                text NOT NULL CHECK (source IN ('university', 'apple_iap', 'stripe')),
  organization_id       uuid NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_ref          text NULL,                        -- reserved for Apple/Stripe later
  product_id            text NULL,
  status                text NOT NULL CHECK (status IN ('active', 'inactive')),
  expires_at            timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlements_university_has_org CHECK (
    source <> 'university' OR organization_id IS NOT NULL
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_university_one_row
  ON entitlements (user_id, organization_id) WHERE source = 'university';
CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements (user_id);

COMMIT;
```

Notes:

- No `billing_events` table in this migration. It belongs with the Apple phase, in `0005`.
- The `feat/stripe` `0004_subscriptions.sql` must be renumbered to `0005` (or later) when that branch is rebased. This migration must not be renamed after it has been applied anywhere.
- No `DROP` or `ALTER` of existing objects. The migration is safe to apply before the code ships.

### 3.2 Down migration (kept in the repo, applied only if the feature is abandoned)

`artifacts/api-server/migrations/0004_entitlements_and_organizations.down.sql`:

```sql
BEGIN;
DROP TABLE IF EXISTS entitlements;
DROP TABLE IF EXISTS organization_invitations;
DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS organizations;
COMMIT;
```

Run only after exporting the rows, and only with the server flag already off.

### 3.3 Verification of the migration

1. Apply to an empty local Postgres. Confirm the four tables and indexes exist.
2. Apply to a copy of production schema (restored into a scratch database, not production). Confirm no existing table changes, using a schema diff.
3. Apply the down migration to the scratch database and confirm the schema matches the pre-migration state.

## 4. Server: shared helpers

### 4.1 `src/lib/entitlements.ts` (new)

- `universityEntitlementFor(userId): Promise<{ active: boolean; organizationId?: string; organizationName?: string; accessEndsAt?: Date | null }>`
  - Active only when **all** hold: a membership row with `status='active'`, the organization `status='active'`, and `access_ends_at IS NULL OR access_ends_at > now()`.
  - Read-time check. Does not depend on the `entitlements` row being current.
- `entitlementFor(userId)` returns the union of sources. For this release only `university` is populated.
- `contactLimitFor(userId): number | null`. Returns `null` (unlimited) when university-active, otherwise `6`. Replaces the hardcoded constant in `contacts.ts`.
- `syncUniversityEntitlement(client, userId, orgId)`: upserts the `entitlements` row (source `university`) to `active` or `inactive` to match membership. Called inside the same transaction as every membership change.

### 4.2 `src/lib/invitations.ts` (new)

- `createInviteToken(): { raw: string; hash: string }` uses `crypto.randomBytes(32)` encoded base64url. The hash is SHA-256 hex.
- `hashToken(raw: string): string`.
- Lookups always hash the presented token first and never compare raw values.

### 4.3 `src/middlewares/requireUniversityFlag.ts` (new)

Returns 404 when `UNIVERSITY_ACCESS_ENABLED !== 'true'`. Applied to every new router. A 404 rather than 403 avoids revealing the feature exists.

### 4.4 `src/middlewares/requirePlatformAdmin.ts` (new)

Checks `req.userId` against `PLATFORM_ADMIN_USER_IDS`. Returns 404 for non-admins, matching 4.3.

### 4.5 `src/lib/orgAuth.ts` (new)

`requireOrgRole(role: 'admin' | 'member')`: loads the membership for `(req.params.orgId, req.userId)` with `status='active'`. Returns 404 when the org does not exist or the user is not an active member, so org IDs cannot be probed. Returns 403 only when the user is an active member without the required role.

## 5. API routes

New file `artifacts/api-server/src/routes/organizations.ts`, mounted at `/api` in `routes/index.ts` after `requireAuth` on the router. Every route is wrapped by `requireUniversityFlag`.

### Platform admin

| Method | Path | Auth | Body | Behavior |
|---|---|---|---|---|
| POST | `/api/admin/organizations` | platform admin | `{ name, seatLimit, accessEndsAt?, adminEmail? }` | Creates an organization. With `adminEmail`, also creates an admin invitation (needs `seatLimit` ≥ 1). Returns `201` with the organization and the one-time admin link. |
| PATCH | `/api/admin/organizations/:orgId` | platform admin | `{ name?, seatLimit?, status?, accessEndsAt? }` | Updates. Lowering `seatLimit` below current active seats is refused with `409` and does not revoke anyone. Setting `status='suspended'` deactivates university entitlements through the read-time check, and the sync step runs in the same transaction. |

### Organization admin

| Method | Path | Auth | Body | Behavior |
|---|---|---|---|---|
| GET | `/api/organizations/:orgId` | member | — | Name, status, seat limit, seats used, access end date. |
| GET | `/api/organizations/:orgId/members` | admin | — | Members with role and status. Emails are not returned. |
| POST | `/api/organizations/:orgId/invitations` | admin | `{ email, role? }` | Normalizes email to lowercase. Refuses if a pending invite exists for that email (`409`, returns the existing ID). Creates the token, sends the email if Resend is configured, and returns `{ id, inviteUrl, emailSent }`. `inviteUrl` is shown **once** to the admin. |
| GET | `/api/organizations/:orgId/invitations` | admin | — | Invitations, with status and expiry. Tokens and hashes are never returned. |
| POST | `/api/organizations/:orgId/invitations/:inviteId/revoke` | admin | — | Sets `revoked`. Idempotent. |
| POST | `/api/organizations/:orgId/invitations/:inviteId/resend` | admin | — | Rotates the token (new hash), resets `expires_at` to 14 days, and resends. Old link stops working immediately. |
| POST | `/api/organizations/:orgId/members/:memberId/revoke` | admin | — | Sets membership `revoked`, sets `revoked_at`, and syncs the `entitlements` row to `inactive` in one transaction. An admin cannot revoke the last active admin (`409`). |

### Student

| Method | Path | Auth | Body | Behavior |
|---|---|---|---|---|
| POST | `/api/invitations/preview` | signed in | `{ token }` | Returns `{ organizationName, role, emailHint, expiresAt }`. Returns `404` for unknown or malformed tokens, `410` for expired, revoked, or used invitations. The token is in the body, never the path or query. |
| POST | `/api/invitations/accept` | signed in | `{ token }` | See 5.1. Returns `{ organizationName, role, accessEndsAt }`. |
| GET | `/api/entitlements/me` | signed in | — | `{ university: { active, organizationName?, accessEndsAt? } }`. Read by the app to decide what to show. |

### 5.1 Accept flow (server, single transaction)

1. Confirm the Clerk user's **primary email is verified** (`clerkClient.users.getUser`). Otherwise `403 email_not_verified`.
2. Hash the token. `SELECT ... FROM organization_invitations WHERE token_hash = $1 FOR UPDATE`. Unknown token returns `404`.
3. Check status and `expires_at`. Non-pending returns `410`.
4. Compare the Clerk verified email with `invitation.email` (both lowercased). Mismatch returns `403 email_mismatch` and does not reveal the invited address.
5. `SELECT ... FROM organizations WHERE id = $1 FOR UPDATE`. This serializes concurrent accepts for the same org, so seat counts stay correct. Refuse with `409 seats_full` when active seats ≥ `seat_limit`.
6. Check the organization is `active` and not past `access_ends_at`. Otherwise `410 organization_inactive`.
7. Upsert `organization_members` (`ON CONFLICT (organization_id, user_id) DO UPDATE SET status='active', role=excluded.role, revoked_at=NULL` only if the membership is currently revoked; if already active, return success without changing it, which makes accept idempotent).
8. Call `syncUniversityEntitlement`.
9. Mark invitation `accepted`, set `accepted_by_user_id` and `accepted_at`.
10. Commit. Return success.

Rate limits: `/api/invitations/*` gets its own limiter (for example 20 requests per 15 minutes per user). Token lookups by an unauthenticated caller are impossible because `requireAuth` runs first.

## 6. Invitation delivery

Recommended path, in order of preference:

1. **Email via Resend** (`src/lib/email.ts`, new `sendInvitationEmail`). Requires `RESEND_API_KEY` and a **verified sending domain**. The `onboarding@resend.dev` sender cannot reach arbitrary students. Email body contains the organization name, the inviting admin's organization (not their personal email), the invite link, and the expiry date. No personal data beyond the invited address.
2. **Copy-link fallback.** Always available. The admin sees `inviteUrl` once on creation and can copy it. Used when email is not configured or the student does not receive email.

Delivery constraints:

- Invitation links expire after 14 days.
- Links are single-use. Acceptance changes the status to `accepted`.
- The link is a bearer secret. Anyone with it who also has a verified matching email can accept. This is why email matching is required in 5.1.
- Signed-out students sign in on the invite page itself. Clerk's `forceRedirectUrl` returns them to `/invite`. A student who signs up instead is sent to the dashboard, and `PendingInviteRedirect` returns them to `/invite` while the token is still stored in the tab. Confirm this flow on the Clerk development instance before release (section 9.3).

Resolved (owner decision 2026-10-21): the token is in the URL **fragment** (`/invite#<token>`). Fragments are never sent to the server, so they stay out of access and CDN logs. The page moves the token into sessionStorage and strips it from the address bar, then posts it to the API in a request body. The token never appears in a path or query string.

## 7. Expiry and sweeps

- Access is read-time authoritative (4.1), so expiry never depends on a job.
- An optional daily sweep in `src/lib/scheduler.ts` (added to the existing 09:00 UTC run, guarded by the flag):
  - marks `organization_invitations` past `expires_at` as `expired`;
  - marks `entitlements` rows `inactive` where `expires_at < now()`, and for organizations past `access_ends_at`.
- The sweep is for tidiness and reporting. Removing it changes nothing about who has access.

## 8. Frontend

All changes live in `artifacts/project-novara`. Web only. No native change.

### 8.1 Routes (`src/App.tsx`)

- `/invite` is added **outside** the shell sections and outside `ProtectedRoute`, like `/welcome`, so the native tab bar is hidden and signed-out visitors can sign in from it.
- Renders NotFound unless `VITE_UNIVERSITY_ACCESS` is `true`. The server also returns 404 while `UNIVERSITY_ACCESS_ENABLED` is off.

### 8.2 Invite screen (`src/pages/Invite.tsx`, new)

States:

- Loading: skeleton.
- Ready: "Join {organizationName}" with a single primary button, "Accept invitation". No price, no plan names, no payment wording.
- Success: short confirmation, then navigate to `/dashboard`. The Dashboard reads `/api/entitlements/me`.
- Errors, each with plain text and a next step:
  - `email_not_verified`: "Verify your email in your account settings, then try again."
  - `email_mismatch`: "This invitation was sent to a different email address. Sign in with that address."
  - `seats_full`: "{organizationName} has no open seats. Ask your administrator."
  - `expired` / `revoked` / `accepted`: "This invitation is no longer valid. Ask your administrator for a new one."
  - Network failure: retry button. Mutations use the same single-flight guard as `Welcome.tsx`.

### 8.3 Settings → "Organization" section (`src/pages/Settings.tsx`, new block)

Visible only when `universityAccess` is on **and** the user has an active membership.

- Members see: organization name, access end date (if set).
- Admins also see:
  - invite form (email, role, Send);
  - after creating an invite, a one-time panel showing the link with a Copy button and the warning "This link is shown once";
  - invitation list with status, expiry, Revoke and Resend;
  - member list with role, Revoke (confirmation dialog).
- No payment or upgrade controls appear anywhere in this section.

### 8.4 Contact limit (`src/pages/AddContact.tsx`, existing)

- Limit comes from `/api/entitlements/me` or the server response. The client does not hardcode `6`. The server enforces the limit regardless.

### 8.5 Platform admin

No UI in this release. Operations use authenticated `curl` calls against `/api/admin/organizations` from an admin's machine, with a Clerk session token. Creating a UI for this is a later decision (section 10).

## 9. Tests

### 9.1 API (`artifacts/api-server`)

Confirm first whether the package has a test runner. If it does not, adding one (for example vitest) is a separate, approved change, not part of this feature.

Required cases:

- Token: raw token is never stored or logged; lookup works only via hash; two tokens never collide in a test run of 10,000.
- Accept, happy path: membership created, entitlement `active`, invitation `accepted`.
- Accept, idempotent: second accept by the same user returns success without changing rows.
- Accept, expired: `410`; status unchanged.
- Accept, revoked invitation: `410`.
- Accept, already-accepted by someone else: `410`.
- Accept, email mismatch: `403`; response does not include the invited address.
- Accept, unverified email: `403 email_not_verified`.
- Accept, seats: with `seat_limit = 1` and two different students accepting concurrently, exactly one succeeds and the other gets `409 seats_full`. This test must run against a real Postgres, not a mock.
- Accept, org suspended or past `access_ends_at`: `410`.
- Revoke member: entitlement becomes `inactive` in the same transaction; read-time check returns inactive immediately.
- Last admin: cannot revoke the last active admin (`409`).
- Member (non-admin) calling an admin route: `403`. Non-member calling any org route: `404`.
- Cross-organization: admin of org A cannot read or revoke anything in org B (`404`).
- Flag off: every new route returns `404`, including for platform admins.
- Platform admin route called by a non-admin: `404`.
- Contact limit: university-active user can add contacts beyond 6; a non-entitled user is still blocked at 6 (regression test for the existing limit).
- Lowering seat limit below current seats: `409`; no member is revoked.

### 9.2 Web (`artifacts/project-novara`)

- `pnpm typecheck` and production build pass with the flag both on and off.
- Component tests for the invite screen states (if the package has a test runner; otherwise checklist).
- The browser check runs only against a local dev host (`localhost`) or a Clerk **development** instance, using Clerk test users created for this purpose. Test credentials are never entered by Claude; the owner creates and uses the test accounts.

### 9.3 Manual device matrix (before the flag is turned on in production)

| Surface | Steps | Pass condition |
|---|---|---|
| iOS shell (current TestFlight build, remote mode) | Open invite link from email, sign in, accept, reach dashboard | Invite page full-screen with no tab bar; access shows after accept |
| Android Chrome | Same | Same |
| Android PWA (installed) | Same | Same; no payment screen at any step |
| Signed-out student | Open link, sign up, verify email, return | Lands back on the invite page |
| Wrong email | Sign in with a different account | Mismatch message, no leak of invited address |
| Revoked student | Admin revokes, student reloads dashboard | Access removed; contact limit returns to 6 |

### 9.4 Migration

Section 3.3.

## 10. Owner decisions (answered 2026-10-21)

1. Platform staff create organizations. Admin invitation can be attached at creation.
2. Verify `novaraconnect.group` as the Resend sending domain. **Manual step, not yet done.**
3. `RESEND_API_KEY` on `novara-prod-api`: **not added.** Waits for release approval.
4. Seats are explicit invitations only. A `.edu` address never grants access by itself. Covered by a test.
5. Contract end date is optional (`NULL` means no end).
6. Invitations expire after 14 days.
7. Organization admins act only within their own organization. Covered by a test.
8. Token in the URL fragment, submitted from the client after load. Implemented.
9. `https://app.novaraconnect.group` is the canonical frontend URL. Partly confirmed: no cross-host redirect was returned when fetched, and the page title is "Novara". The HTTP status could not be read from the sandbox, which blocks that host, so recheck from an unrestricted machine before release.

## 11. Delivery order and rollback

### 11.1 Order

1. Owner approves this plan and answers section 10.
2. Migration `0004` is applied to production by hand, after a verified backup. No code depends on it yet, so this is safe on its own.
3. API change is merged to `main` with `UNIVERSITY_ACCESS_ENABLED` unset. `novara-prod-api` is deployed manually (auto-deploy is OFF), and smoke tests confirm every new route returns `404`.
4. Web change is merged to `main` with `VITE_UNIVERSITY_ACCESS` unset. `novara-prod-web` auto-deploys. Confirm the invite route is not reachable and the Settings section is absent.
5. First organization is created by a platform admin in a staging environment (test Clerk instance), then the full device matrix runs.
6. Production: set `UNIVERSITY_ACCESS_ENABLED=true` on `novara-prod-api` and `VITE_UNIVERSITY_ACCESS=true` for the web build. Web build changes require a rebuild, so this step is a deliberate web deploy.
7. First real organization created by platform admin; one pilot student verified.

### 11.2 Rollback

| Problem | Action | Effect |
|---|---|---|
| Bug in invite or accept | Set `UNIVERSITY_ACCESS_ENABLED=false` on `novara-prod-api` and restart | All new routes return `404` immediately. Existing rows are untouched. |
| UI problem | Set `VITE_UNIVERSITY_ACCESS=false` and redeploy web | UI hidden. API stays inert. |
| Wrong access granted | Revoke membership via admin route, or via SQL `UPDATE organization_members SET status='revoked', revoked_at=now()` followed by `UPDATE entitlements SET status='inactive' ...` for that user | Read-time check denies access on next request. |
| Feature abandoned | Export rows, then run `0004_...down.sql` | Schema reverts. Only with the flag off. |
| Migration problem before any org exists | Run down migration | Schema reverts. |

No rollback step touches `feat/stripe`, `main` billing code, or Render service settings beyond the environment variables named above.

## 12. What is intentionally not in this release

- Apple IAP, RevenueCat, `billing_events`, and the `0005` migration (Apple phase).
- Consumer Stripe Checkout, portal, or webhooks on `main`.
- Domain auto-join, SSO, CSV import, per-seat billing, admin web UI for platform staff.
- Any grace period. Access follows the rules in section 4.1 exactly.

## 13. Approval history

- 2026-10-21: plan approved for implementation with the section 10 answers.
- Implementation branch: `feat/university-access` (from `main` d3f1344). Not merged, not deployed.

## 14. Implementation status and release checklist

### Built (on `feat/university-access`)

- Migration `0004_entitlements_and_organizations.sql`, plus `.down.sql`. Adds the four tables, a partial unique index so only one pending invitation per organization and address can exist, and a unique index for university entitlement rows.
- `src/lib/flags.ts`: strict `UNIVERSITY_ACCESS_ENABLED === "true"`.
- `src/lib/entitlements.ts`: read-time access check, contact-limit helper, transactional sync.
- `src/lib/invitations.ts`: token generation and SHA-256 storage, email normalization, fragment URL.
- `src/lib/orgAuth.ts`: per-organization role check. Non-members get 404.
- `src/lib/clerkEmail.ts`: verified primary email from Clerk.
- `src/lib/email.ts`: `sendOrganizationInvitationEmail`. Returns false on failure and never logs the link.
- `src/routes/university.ts`: platform admin, organization admin, invitation preview and accept, entitlement read.
- Contact limit now goes through `contactLimitFor`. With the flag off it is exactly 6, with no database call.
- `/api/features` reports `universityAccess`.
- Web: `/invite` page, Settings Organization section, `PendingInviteRedirect`, `useUniversityEntitlement`, and the AddContact limit lift. Gated by `VITE_UNIVERSITY_ACCESS`.

### Tests

- API: full suite 238 of 238 passing against local Postgres 16. Includes 37 new integration tests (flag off, roles, cross-org, accept paths, expiry, revocation, seats including a concurrent accept race, token handling) and 11 unit tests.
- Web: 187 existing tests pass, plus 7 new tests for token capture and storage.
- Typecheck clean for both packages. Web production build passes with the flag off and on.
- Migration 0004 applied, rolled back, and re-applied cleanly on a scratch database.

### Not done, by decision or by constraint

- No scheduled expiry sweep. Access is read-time authoritative, so this is for reporting only and was left out.
- No browser end-to-end run. The Clerk sign-in and redirect flow needs a Clerk development instance, which the owner should exercise.
- No device matrix run (iOS shell, Android, PWA). Section 9.3 is still to do.
- Migration 0001 does not apply to a bare database (it alters `contacts`). Migration 0004 was checked against a scratch database that had the base tables. Verify against a copy of production before release.

### Release checklist (every item needs owner action or approval)

1. Review the branch diff and the migration SQL.
2. Verify `novaraconnect.group` in Resend, then set `RESEND_FROM_EMAIL` (owner).
3. Confirm `https://app.novaraconnect.group` returns 200 with no cross-host redirect, from an unrestricted machine.
4. Back up production, then apply migration 0004 by hand (owner approval).
5. Deploy `novara-prod-api` manually with `UNIVERSITY_ACCESS_ENABLED` unset. Smoke test: every new route returns 404.
6. Add `RESEND_API_KEY` to `novara-prod-api` (owner approval).
7. Merge to `main` with `VITE_UNIVERSITY_ACCESS` unset, so the web build hides all UI. `novara-prod-web` auto-deploys.
8. Run the device matrix on a staging environment with a Clerk development instance (section 9.3).
9. Set `UNIVERSITY_ACCESS_ENABLED=true` on the API and `VITE_UNIVERSITY_ACCESS=true` on the web build. Each is a separate, approved step.
10. Platform admin creates the first organization for a pilot.

Rollback is in section 11.2 and does not depend on any of the above.
