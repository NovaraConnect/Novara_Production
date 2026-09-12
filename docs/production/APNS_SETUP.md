# Native iOS push (APNs) — setup checklist

Everything in the repo is done. **Nothing in this document has happened yet**,
and until it does the native push path is completely inert: with the `APNS_*`
environment variables unset, `isApnsConfigured()` is false, no APNs provider is
ever constructed, and the scheduler behaves exactly as it did before.

Web Push / PWA notifications are unaffected throughout.

---

## 1. Apple Developer (you)

| # | Step | Where |
|---|---|---|
| 1 | Create an **APNs Auth Key** | Certificates, Identifiers & Profiles → **Keys** → `+` → tick **Apple Push Notifications service (APNs)** |
| 2 | Download the **`.p8` file** | ⚠️ **Downloadable exactly once.** Save it somewhere safe immediately. |
| 3 | Note the **Key ID** (10 characters) | shown next to the key |
| 4 | Note the **Team ID** | `N89Q767Q22` |
| 5 | Enable **Push Notifications** on the App ID | Identifiers → `group.novaraconnect.app` → tick **Push Notifications** |

One key works for every app on the team and for both APNs environments, so
this is a one-time job.

## 2. Xcode (you)

Target **Novara Connect** → **Signing & Capabilities** → **`+` Capability** →
**Push Notifications**.

That creates the `aps-environment` entitlement. Xcode picks `development` or
`production` automatically based on how the build is signed — you do not choose.

## 3. Render → `novara-prod-api` → Environment (you)

Four variables. **I never see or handle these.**

| Variable | Value |
|---|---|
| `APNS_KEY_ID` | the 10-character Key ID from step 3 |
| `APNS_TEAM_ID` | `N89Q767Q22` |
| `APNS_BUNDLE_ID` | `group.novaraconnect.app` |
| `APNS_PRIVATE_KEY_B64` | the `.p8` file, **base64-encoded** |

To produce the last one:

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | tr -d '\n' | pbcopy
```

It is base64 rather than raw PEM on purpose — the `.p8` is multi-line, and
multi-line values in dashboard environment variables get silently mangled in
ways that are miserable to debug.

All four must be present. Any missing one leaves native push inert.

## 4. Database (needs a migration run)

`artifacts/api-server/migrations/0002_add_apns_tokens.sql` creates one new
table, `apns_tokens`. It is purely additive — no existing table is altered, and
nothing reads it unless the `APNS_*` variables are set.

## 5. Build and upload (after review)

The Capacitor plugin adds a CocoaPod, so this needs a fresh build:

```bash
cd artifacts/project-novara
pnpm install --frozen-lockfile
export PATH="/opt/homebrew/bin:$PATH"
./node_modules/.bin/cap sync ios
```

Then archive and upload as usual. Remember the build number must exceed the
last one uploaded.

---

## Verifying it works

1. Install the new TestFlight build, sign in, go to **Settings → Notifications**
2. The "Not supported" box should be **gone** — the native app reports itself
   supported because it uses APNs, not Web Push
3. Toggle **Push notifications** on → iOS shows the system permission prompt
4. Tap **Send test notification**

If nothing arrives, check the API logs for `APNs delivery failed`. The single
most likely cause is an **environment mismatch**: TestFlight and App Store
builds mint **production** tokens, while a build run from Xcode onto a device
mints **sandbox** tokens, and each host rejects the other's tokens with
`BadDeviceToken`. Tokens are stored with their environment for this reason; a
debug build needs `VITE_APNS_ENVIRONMENT=sandbox` at web build time.

## Duplicate notifications

By design, you will **not** get two notifications if you have both the PWA and
the iOS app installed. The scheduler prefers native: if a user has any APNs
token, only APNs is used and the Web Push subscriptions stay registered but
idle. The rule lives in `api-server/src/lib/pushRouting.ts` and is unit-tested.

## Rollback

- **Fastest:** delete the four `APNS_*` variables in Render. Native push goes
  inert immediately; Web Push is untouched.
- **Code:** revert the PR. The `apns_tokens` table can stay — nothing else
  references it — or be dropped.
- **iOS:** stop distributing the build. The previous TestFlight build is
  unaffected.

## Known gaps, unrelated to this change

- `reminder_time` is stored and editable in settings but **never read** — the
  scheduler is hardcoded to 09:00 UTC.
- `notify_weekly_digest` is likewise stored but never read by the scheduler.
